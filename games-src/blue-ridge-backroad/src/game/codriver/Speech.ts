/**
 * Speaking the pace notes.
 *
 * Web Speech output does not surface as an `AudioNode` in Chrome or Safari, so
 * it cannot be routed through the game's AudioContext — no bandpass, no radio
 * treatment, no ducking against the engine. That is the real constraint here,
 * not the timbre.
 *
 * It turns out not to matter much: real pace notes are delivered flat, fast and
 * clipped, so a dry synthetic read is closer to authentic than dramatic voice
 * acting would be. Rate is pushed up and pitch down to get there.
 */

const RATE = 1.35;
const PITCH = 0.85;
const VOLUME = 0.9;

/** Voices that read cleanly at speed, best first. */
const PREFERRED = [
    'Google UK English Male',
    'Microsoft Ryan Online (Natural) - English (United Kingdom)',
    'Daniel',
    'Google US English',
    'Microsoft Guy Online (Natural) - English (United States)'
];

export class Speech {
    /** False when the browser has no speech synthesis at all. */
    readonly available: boolean;
    private voice: SpeechSynthesisVoice | null = null;
    private picked = false;

    constructor() {
        this.available = typeof window !== 'undefined' && 'speechSynthesis' in window;
        if (!this.available) return;
        // Voices load asynchronously, and on some browsers the first call
        // returns an empty list.
        this.pickVoice();
        try {
            window.speechSynthesis.addEventListener('voiceschanged', this.pickVoice);
        } catch {
            /* older implementations expose it as a property only */
        }
    }

    private pickVoice = (): void => {
        try {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length === 0) return;
            for (const name of PREFERRED) {
                const match = voices.find((v) => v.name === name);
                if (match) {
                    this.voice = match;
                    this.picked = true;
                    return;
                }
            }
            // Fall back to any English voice, then to whatever exists.
            this.voice = voices.find((v) => v.lang.startsWith('en')) ?? voices[0];
            this.picked = true;
        } catch {
            this.voice = null;
        }
    };

    get voiceName(): string {
        return this.voice?.name ?? (this.picked ? 'default' : 'loading');
    }

    /**
     * Say a note, cancelling anything still being spoken. A pace note that
     * arrives late is worse than no note, so nothing ever queues.
     */
    say(text: string): void {
        if (!this.available || !text) return;
        try {
            const synth = window.speechSynthesis;
            synth.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            if (this.voice) utterance.voice = this.voice;
            utterance.rate = RATE;
            utterance.pitch = PITCH;
            utterance.volume = VOLUME;
            synth.speak(utterance);
        } catch {
            /* speech is a nicety; never let it break the drive */
        }
    }

    stop(): void {
        if (!this.available) return;
        try {
            window.speechSynthesis.cancel();
        } catch {
            /* nothing to do */
        }
    }

    dispose(): void {
        this.stop();
        if (!this.available) return;
        try {
            window.speechSynthesis.removeEventListener('voiceschanged', this.pickVoice);
        } catch {
            /* nothing to do */
        }
    }
}
