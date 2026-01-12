import { BtcaStreamEventSchema, type BtcaStreamEvent } from 'btca-server/stream/types';

/**
 * Parse a Server-Sent Events stream from a Response
 */
export async function* parseSSEStream(response: Response): AsyncGenerator<BtcaStreamEvent> {
	if (!response.body) {
		throw new Error('Response body is null');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// Process complete events from buffer
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

			let eventType = '';
			let eventData = '';

			for (const line of lines) {
				if (line.startsWith('event: ')) {
					eventType = line.slice(7);
				} else if (line.startsWith('data: ')) {
					eventData = line.slice(6);
				} else if (line === '' && eventData) {
					// Empty line = end of event
					try {
						const parsed = JSON.parse(eventData) as unknown;
						const validated = BtcaStreamEventSchema.parse(parsed);
						yield validated;
					} catch (error) {
						console.error('Failed to parse SSE event:', error);
					}
					eventType = '';
					eventData = '';
				}
			}
		}

		// Process any remaining data in buffer
		if (buffer.trim()) {
			const lines = buffer.split('\n');
			let eventData = '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					eventData = line.slice(6);
				}
			}

			if (eventData) {
				try {
					const parsed = JSON.parse(eventData) as unknown;
					const validated = BtcaStreamEventSchema.parse(parsed);
					yield validated;
				} catch {
					// Ignore incomplete final event
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}
