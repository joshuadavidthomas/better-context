import { homedir } from 'node:os';
import { join } from 'node:path';

const HISTORY_FILE = join(homedir(), '.local', 'share', 'btca', 'input-history.json');
const MAX_HISTORY_SIZE = 100;

interface HistoryData {
	entries: string[];
}

/**
 * Load history from disk
 */
async function loadHistory(): Promise<string[]> {
	try {
		const file = Bun.file(HISTORY_FILE);
		if (!(await file.exists())) {
			return [];
		}
		const data = (await file.json()) as HistoryData;
		return data.entries ?? [];
	} catch {
		return [];
	}
}

/**
 * Save history to disk
 */
async function saveHistory(entries: string[]): Promise<void> {
	try {
		// Ensure directory exists
		const dir = join(homedir(), '.local', 'share', 'btca');
		const dirFile = Bun.file(dir);
		if (!(await dirFile.exists())) {
			await Bun.$`mkdir -p ${dir}`.quiet();
		}

		const data: HistoryData = { entries };
		await Bun.write(HISTORY_FILE, JSON.stringify(data, null, 2));
	} catch {
		// Silently fail - history is not critical
	}
}

/**
 * Input history manager for TUI
 * Provides up/down arrow navigation through previous inputs
 */
export class InputHistory {
	private entries: string[] = [];
	private currentIndex = -1;
	private pendingInput = ''; // Stores current input when navigating history
	private loaded = false;

	/**
	 * Initialize by loading history from disk
	 */
	async init(): Promise<void> {
		if (this.loaded) return;
		this.entries = await loadHistory();
		this.loaded = true;
	}

	/**
	 * Add a new entry to history (called on submit)
	 */
	async add(input: string): Promise<void> {
		const trimmed = input.trim();
		if (!trimmed) return;

		// Don't add duplicates of the most recent entry
		if (this.entries.length > 0 && this.entries[this.entries.length - 1] === trimmed) {
			this.reset();
			return;
		}

		// Remove any existing occurrence to avoid duplicates
		const existingIndex = this.entries.indexOf(trimmed);
		if (existingIndex !== -1) {
			this.entries.splice(existingIndex, 1);
		}

		this.entries.push(trimmed);

		// Trim to max size
		if (this.entries.length > MAX_HISTORY_SIZE) {
			this.entries = this.entries.slice(-MAX_HISTORY_SIZE);
		}

		await saveHistory(this.entries);
		this.reset();
	}

	/**
	 * Navigate to previous entry (up arrow)
	 * Returns the entry to display, or null if no more history
	 */
	navigateUp(currentInput: string): string | null {
		if (this.entries.length === 0) return null;

		// First time navigating - save current input
		if (this.currentIndex === -1) {
			this.pendingInput = currentInput;
			this.currentIndex = this.entries.length - 1;
			return this.entries[this.currentIndex] ?? null;
		}

		// Navigate to older entry
		if (this.currentIndex > 0) {
			this.currentIndex--;
			return this.entries[this.currentIndex] ?? null;
		}

		// Already at oldest entry
		return null;
	}

	/**
	 * Navigate to next entry (down arrow)
	 * Returns the entry to display, or null if back to current input
	 */
	navigateDown(): string | null {
		if (this.currentIndex === -1) return null;

		this.currentIndex++;

		// Back to pending input
		if (this.currentIndex >= this.entries.length) {
			const pending = this.pendingInput;
			this.reset();
			return pending;
		}

		return this.entries[this.currentIndex] ?? null;
	}

	/**
	 * Reset navigation state (called when input changes or on submit)
	 */
	reset(): void {
		this.currentIndex = -1;
		this.pendingInput = '';
	}

	/**
	 * Check if currently navigating history
	 */
	isNavigating(): boolean {
		return this.currentIndex !== -1;
	}
}

// Singleton instance for the TUI
export const inputHistory = new InputHistory();
