import socketio
import logging

logger = logging.getLogger(__name__)

class SocketManager:
    def __init__(self):
        self.sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins=["http://localhost:3000", "http://127.0.0.1:3000"])
        self.app = socketio.ASGIApp(self.sio)

        @self.sio.event
        async def connect(sid, environ):
            logger.info(f"Socket connected: {sid}")
            await self.sio.emit('connection_success', {'data': 'Connected to backend'}, room=sid)

        @self.sio.event
        async def disconnect(sid):
            logger.info(f"Socket disconnected: {sid}")

    async def emit(self, event: str, data: dict):
        """Emit an event to all connected clients."""
        try:
            await self.sio.emit(event, data)
            logger.info(f"Emitted event {event} with data: {data}")
        except Exception as e:
            logger.error(f"Failed to emit event {event}: {e}")

# Global instance
socket_manager = SocketManager()
