interface WebSocketAsyncOptions {
	autoReconnect?: boolean
	initialBackoff?: number; // in ms
	maxBackoff?: number;     // in ms
	origin?: string;
}

type WebSocketMessage = { type: 'text', data: string } | { type: 'binary', data: ArrayBuffer }

interface WSEvents {
	message: CustomEvent<WebSocketMessage>;
	binary: CustomEvent<ArrayBuffer>;
	text: CustomEvent<string>;
}

type EventListener<K extends keyof WSEvents> = (event: WSEvents[K]) => void;

export class WebSocketAsync extends EventTarget implements AsyncIterableIterator<WebSocketMessage> {

	private ws!: WebSocket;
	private reconnectAttempts = 0;
	private stopReconnect = false;
	private options = {} as WebSocketAsyncOptions
	private url: string
	private pendingMessages: WebSocketMessage[] = []
	private resolveQueue: ((value: IteratorResult<WebSocketMessage>) => void)[] = [];

	constructor(path: string, options: WebSocketAsyncOptions = {}) {
		super();
		this.options = options;
		this.options.initialBackoff ??= 1000; // ms
		this.options.maxBackoff ??= 30_000;
		this.options.origin ??= location.origin.replace(/^http/, 'ws');
		this.options.autoReconnect = options.autoReconnect ?? true;
		this.url = this.options.origin + path;
		this.stopReconnect = !this.options.autoReconnect;
	}

	on<K extends keyof WSEvents>(type: K, listener: EventListener<K>) {
		this.addEventListener(type, listener as EventListenerOrEventListenerObject);
		return () => this.removeEventListener(type, listener as EventListenerOrEventListenerObject);
	}

	once<K extends keyof WSEvents>(type: K, listener: EventListener<K>) {
		const unsubscribe = this.on(type, (...args) => {
			listener(...args);
			unsubscribe();
		})
	}

	private dispatch<K extends keyof WSEvents>(event: K, data: WSEvents[K]['detail']) {
		this.dispatchEvent(new CustomEvent(event, { detail: data }));
	}

	async connect() {
		this.stopReconnect = !this.options.autoReconnect!;
		return await new Promise(resolve => {
			this.ws = new WebSocket(this.url);
			this.ws.binaryType = 'arraybuffer';

			this.ws.onopen = () => {
				this.reconnectAttempts = 0;
				resolve(0);
			}
			this.ws.onclose = () => this.reconnect();

			this.ws.onmessage = msg => {
				const wsMsg: WebSocketMessage = { type: typeof msg.data === 'string' ? 'text' : 'binary', data: msg.data };

				this.dispatch('message', wsMsg);
				this.dispatch(wsMsg.type, wsMsg.data);

				if (this.resolveQueue.length > 0) {
					this.resolveQueue.shift()!({ value: wsMsg, done: false });
				} else {
					this.pendingMessages.push(wsMsg);
				}
			}
		})
	}

	async send(data: ArrayBuffer | Uint8Array | string) {
		const checkInterval = 20; // ms
		const sendTimeout = 30_000; // ms
		return new Promise<void>((resolve, reject) => {
			this.ws.send(data);
			const sendTime = Date.now();

			const checkBuffer = () => {
				if (this.ws.readyState !== WebSocket.OPEN) {
					return reject(new Error("WebSocket is not open"));
				}

				if (Date.now() - sendTime > sendTimeout) {
					return reject(new Error("Timeout while waiting for WebSocket buffer to flush"));
				}

				if (this.ws.bufferedAmount === 0) {
					resolve(); // Data flushed
				} else {
					setTimeout(checkBuffer, checkInterval);
				}
			}

			checkBuffer();
		})
	}

	async sendJson(what: any) {
		return this.send(JSON.stringify(what))
	}

	private async reconnect() {
		if (this.stopReconnect) return;

		this.reconnectAttempts++;
		const backoff = Math.min(
			this.options.initialBackoff! * 2 ** (this.reconnectAttempts - 1),
			this.options.maxBackoff!
		);
		await new Promise((resolve) => setTimeout(resolve, backoff));
		await this.connect();
	}

	[Symbol.asyncIterator](): AsyncIterableIterator<WebSocketMessage> { return this; }

	next(): Promise<IteratorResult<WebSocketMessage, WebSocketMessage>> {
		if (this.pendingMessages.length > 0) {
			return Promise.resolve({ value: this.pendingMessages.shift()!, done: false });
		}

		if (this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket is not open");
		}

		return new Promise((resolve) => this.resolveQueue.push(resolve));
	}

	close() {
		this.stopReconnect = true;
		this.ws?.close();
		this.resolveQueue.forEach(func => func({ value: undefined, done: true }));
	}

	return(): Promise<IteratorResult<WebSocketMessage>> {
		this.close();
		return Promise.resolve({ value: undefined, done: true });
	}
}