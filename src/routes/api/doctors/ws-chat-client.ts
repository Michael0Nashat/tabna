// WebSocket client service for chat functionality
// Connects to the Go backend WebSocket endpoint at /ws/chat

interface ChatWSRequest {
    Type: string; // subscribe | message
    ConversationID: string;
    SenderType: string;
    Message?: string;
}

interface ChatWSEvent {
    Type: string; // connected | subscribed | message.created | error
    Message?: any;
    Error?: string;
}

interface WSClient {
	ws: WebSocket | null;
	url: string;
	conversations: Map<string, any>;
	onMessage?: (event: ChatWSEvent) => void;
	onError?: (error: string) => void;
	isConnecting: boolean;
	subscribe(conversationId: string, senderType: string): void;
	unsubscribe(conversationId: string): void;
	sendMessage(conversationId: string, senderType: string, message: string): void;
	connect(): Promise<void>;
	disconnect(): void;
	cleanup(): void;
}

class BreezeWSClient implements WSClient {
	ws: WebSocket | null = null;
	url: string;
	conversations: Map<string, any> = new Map();
	onMessage?: (event: ChatWSEvent) => void;
	onError?: (error: string) => void;
	isConnecting: boolean = false;

	constructor(url: string = '/ws/chat') {
		this.url = url.startsWith('http') ? url : window.location.origin + url;
	}

	async connect(): Promise<void> {
		if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
			return;
		}

		this.isConnecting = true;

		try {
			this.ws = new WebSocket(this.url);

			return new Promise((resolve, reject) => {
				if (!this.ws) {
					reject(new Error('WebSocket not initialized'));
					return;
				}

				this.ws.onopen = () => {
					this.isConnecting = false;
					resolve();
				};

				this.ws.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data);
						this.handleMessage(data);
					} catch (error) {
						this.handleError(`Invalid message format: ${error}`);
					}
				};

				this.ws.onclose = () => {
					this.isConnecting = false;
					this.ws = null;
				};

				this.ws.onerror = (error) => {
					this.isConnecting = false;
					this.handleError(`WebSocket error: ${error}`);
				};
			});
		} catch (error) {
			this.isConnecting = false;
			this.handleError(`Failed to connect: ${error}`);
			throw error;
		}
	}

	disconnect(): void {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		this.isConnecting = false;
	}

	cleanup(): void {
		this.disconnect();
		this.conversations.clear();
	}

	subscribe(conversationId: string, senderType: string): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			this.handleError('WebSocket not connected');
			return;
		}

		const request: ChatWSRequest = {
			Type: 'subscribe',
			ConversationID: conversationId,
			SenderType: senderType
		};

		try {
			this.ws.send(JSON.stringify(request));
		} catch (error) {
			this.handleError(`Failed to send subscription: ${error}`);
		}
	}

	unsubscribe(conversationId: string): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return;
		}

		this.conversations.delete(conversationId);
	}

	sendMessage(conversationId: string, senderType: string, message: string): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			this.handleError('WebSocket not connected');
			return;
		}

		const request: ChatWSRequest = {
			Type: 'message',
			ConversationID: conversationId,
			SenderType: senderType,
			Message: message
		};

		try {
			this.ws.send(JSON.stringify(request));
		} catch (error) {
			this.handleError(`Failed to send message: ${error}`);
		}
	}

	private handleMessage(event: ChatWSEvent): void {
		if (event.Type === 'message.created' && event.Message) {
			this.onMessage?.(event);
		} else if (event.Type === 'error') {
			this.handleError(event.Error || 'Unknown error');
		} else {
			this.onMessage?.(event);
		}
	}

	private handleError(error: string): void {
		console.error('WebSocket error:', error);
		this.onError?.(error);
	}
}

// Singleton instance
let wsClient: WSClient | null = null;

export function getWSClient(): WSClient {
	if (!wsClient) {
		wsClient = new BreezeWSClient();
	}
	return wsClient;
}

export function cleanupWSClient(): void {
	if (wsClient) {
		wsClient.cleanup();
		wsClient = null;
	}
}