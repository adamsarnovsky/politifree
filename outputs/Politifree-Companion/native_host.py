"""Private Chrome native messaging host. No HTTP listener, token or autostart."""
import base64
import json
import os
from pathlib import Path
import queue
import re
import struct
import sys
import threading

MAX_MESSAGE = 45_000_000


def request_priority(message):
    # Control requests precede inference; captions precede queued media.
    # A running inference remains serialized to protect model state.
    if message.get('action') != 'analyze': return 0
    payload = message.get('payload')
    return 1 if isinstance(payload, dict) and payload.get('kind') == 'text' else 2


def read_exact(stream, size):
    chunks = bytearray()
    while len(chunks) < size:
        chunk = stream.read(size - len(chunks))
        if not chunk:
            if not chunks:
                return None
            raise ValueError('Truncated message')
        chunks.extend(chunk)
    return bytes(chunks)


def read_message(stream):
    header = read_exact(stream, 4)
    if header is None: return None
    size = struct.unpack('<I', header)[0]
    if size < 2 or size > MAX_MESSAGE: raise ValueError('Invalid message size')
    body = read_exact(stream, size)
    if body is None: raise ValueError('Truncated message')
    value = json.loads(body)
    if not isinstance(value, dict): raise ValueError('Invalid message')
    return value


def write_message(stream, value):
    body = json.dumps(value, separators=(',', ':')).encode('utf-8')
    if len(body) > 1_000_000: raise ValueError('Result too large')
    stream.write(struct.pack('<I', len(body)) + body); stream.flush()


def handle(analyzer, message):
    action = message.get('action')
    if action == 'health': return {'ready':analyzer.ready, 'serviceAvailable':True, 'version':'0.6.15', 'protocol':2}
    if action == 'stop': analyzer.unload(); return {'ready':False}
    if action == 'start': analyzer.load(); return {'ready':analyzer.ready, 'protocol':2}
    if action != 'analyze': raise ValueError('Unsupported request')
    payload = message.get('payload')
    if not isinstance(payload, dict): raise ValueError('Invalid payload')
    kind = payload.get('kind')
    if kind not in ('text','image','media','live-audio'): raise ValueError('Unsupported media')
    text = payload.get('text', '')
    context = payload.get('context', '')
    if not isinstance(text,str) or not isinstance(context,str) or len(text)>6000 or len(context)>6000: raise ValueError('Invalid text')
    data = None
    if kind != 'text':
        encoded = payload.get('data')
        if not isinstance(encoded,str): raise ValueError('Invalid media')
        data = base64.b64decode(encoded, validate=True)
        if not data or len(data) > (10*1024*1024 if kind == 'image' else 32*1024*1024): raise ValueError('Invalid media size')
    analyzer.load()  # Idempotent, lazy loading on the first actual analysis.
    with analyzer.lock:
        analyzer.release_idle_models()
        if kind == 'text': result = analyzer.classify(text)
        elif kind == 'image': result = analyzer.image(data, context=context, visual=True)
        else: result = analyzer.media(data, live=kind=='live-audio', context=context, visual=True)
    return {**result, 'ready':True, 'protocol':2}


def authorized(origin, root):
    if not re.fullmatch(r'chrome-extension://[a-p]{32}/?', origin): return False
    manifest = json.loads((root / 'app.politifree.engine.json').read_text(encoding='utf-8-sig'))
    return origin.rstrip('/')+'/' in manifest['allowed_origins']


def main():
    root = Path(__file__).resolve().parent
    if len(sys.argv)<2 or not authorized(sys.argv[1],root): return 1
    if os.name == 'nt':
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    output = sys.stdout.buffer
    # Model libraries may print progress. Never let it corrupt the framed stream.
    sys.stdout = sys.stderr
    from server import Analyzer
    analyzer = Analyzer()
    incoming = queue.PriorityQueue(maxsize=4)
    def reader():
        sequence = 0
        try:
            while True:
                message = read_message(sys.stdin.buffer)
                if message is None: break
                incoming.put((request_priority(message), sequence, message))
                sequence += 1
        except Exception:
            pass
        finally:
            # EOF means Chrome disconnected. Exit even during native inference.
            os._exit(0)
    threading.Thread(target=reader, daemon=True).start()
    while True:
        try: _, _, message = incoming.get(timeout=90)
        except queue.Empty:
            analyzer.unload()
            continue
        request_id = message.get('id')
        if type(request_id) is not int or request_id < 1: return 1
        try: reply = {'id':request_id, 'ok':True, **handle(analyzer,message)}
        except Exception: reply = {'id':request_id, 'ok':False, 'ready':analyzer.ready, 'error':'Local analysis could not complete. Ordinary content remains visible.'}
        write_message(output,reply)


if __name__ == '__main__':
    raise SystemExit(main())
