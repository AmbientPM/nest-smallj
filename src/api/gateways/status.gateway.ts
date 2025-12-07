import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

interface ClientConnection {
    socket: WebSocket;
    userId?: number;
    lastPing: number;
}

@WebSocketGateway({ path: '/ws/status' })
export class StatusGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private clients: Map<number, ClientConnection> = new Map();

    handleConnection(client: WebSocket) {
        console.log('WebSocket client connected');

        // Store connection with initial data
        const connection: ClientConnection = {
            socket: client,
            lastPing: Date.now(),
        };

        // Set up ping/pong to keep connection alive
        const pingInterval = setInterval(() => {
            if (client.readyState === WebSocket.OPEN) {
                client.ping();
            } else {
                clearInterval(pingInterval);
            }
        }, 30000); // Ping every 30 seconds

        client.on('pong', () => {
            connection.lastPing = Date.now();
        });

        client.on('message', (data: Buffer) => {
            try {
                const message = JSON.parse(data.toString());

                if (message.type === 'auth' && message.userId) {
                    connection.userId = message.userId;
                    this.clients.set(message.userId, connection);
                    console.log(`User ${message.userId} authenticated via WebSocket`);

                    // Send confirmation
                    client.send(JSON.stringify({
                        type: 'auth_success',
                        userId: message.userId,
                    }));
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        });
    }

    handleDisconnect(client: WebSocket) {
        console.log('WebSocket client disconnected');

        // Find and remove the client
        for (const [userId, connection] of this.clients.entries()) {
            if (connection.socket === client) {
                this.clients.delete(userId);
                console.log(`User ${userId} disconnected`);
                break;
            }
        }
    }

    // Send message to specific user
    sendToUser(userId: number, message: any) {
        const connection = this.clients.get(userId);

        if (connection && connection.socket.readyState === WebSocket.OPEN) {
            connection.socket.send(JSON.stringify(message));
            return true;
        }

        return false;
    }

    // Send message to all connected clients
    broadcast(message: any) {
        const messageStr = JSON.stringify(message);

        this.clients.forEach((connection) => {
            if (connection.socket.readyState === WebSocket.OPEN) {
                connection.socket.send(messageStr);
            }
        });
    }

    // Get all connected user IDs
    getConnectedUsers(): number[] {
        return Array.from(this.clients.keys());
    }

    // Check if user is connected
    isUserConnected(userId: number): boolean {
        return this.clients.has(userId);
    }
}
