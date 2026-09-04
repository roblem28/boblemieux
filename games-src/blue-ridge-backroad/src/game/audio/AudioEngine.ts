import { clamp, lerp } from '../util/mathx';
import type { VehiclePhysics } from '../vehicle/VehiclePhysics';

/**
 * Every sound here is synthesised — there are no audio files to ship, hotlink
 * or license.
 *
 * The context is created inside the START ENGINE click handler, which is the
 * user gesture browsers require. Continuous parameters are driven with
 * `setTargetAtTime` rather than per-frame `setValueAtTime`, so the audio thread
 * gets a smooth ramp instead of 60 scheduled events a second.
 */

const NOISE_SECONDS = 2;

const makeNoiseBuffer = (ctx: AudioContext): AudioBuffer => {
    const len = ctx.sampleRate * NOISE_SECONDS;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
        // Slightly brown-tinted noise: less fizzy than pure white.
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        data[i] = w * 0.6 + last * 3.2;
    }
    return buf;
};

/** Soft clipping curve — gives the engine tone some grit. */
const makeShaperCurve = (amount: number): Float32Array<ArrayBuffer> => {
    const n = 1024;
    const curve = new Float32Array(new ArrayBuffer(1024 * 4));
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    return curve;
};

export class AudioEngine {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private engineGain: GainNode | null = null;
    private engineFilter: BiquadFilterNode | null = null;
    private oscillators: OscillatorNode[] = [];
    private oscGains: GainNode[] = [];
    private engineNoise: AudioBufferSourceNode | null = null;
    private engineNoiseGain: GainNode | null = null;
    private gravelGain: GainNode | null = null;
    private gravelFilter: BiquadFilterNode | null = null;
    private skidGain: GainNode | null = null;
    private skidFilter: BiquadFilterNode | null = null;
    private windGain: GainNode | null = null;
    private ambienceGain: GainNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;
    private birdTimer = 0;
    private started = false;

    muted = false;

    get running(): boolean {
        return this.started && this.ctx !== null;
    }

    /** Must be called from inside a user-gesture handler. */
    start(): void {
        if (this.started) {
            void this.ctx?.resume();
            return;
        }
        type WithWebkit = typeof window & { webkitAudioContext?: typeof AudioContext };
        const Ctor = window.AudioContext ?? (window as WithWebkit).webkitAudioContext;
        if (!Ctor) return;
        let ctx: AudioContext;
        try {
            ctx = new Ctor();
        } catch {
            return;
        }
        this.ctx = ctx;
        this.started = true;
        this.noiseBuffer = makeNoiseBuffer(ctx);

        this.master = ctx.createGain();
        this.master.gain.value = 0.0001;
        this.master.connect(ctx.destination);

        // ------------------------------------------------------------ engine
        this.engineFilter = ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 700;
        this.engineFilter.Q.value = 1.1;

        const shaper = ctx.createWaveShaper();
        shaper.curve = makeShaperCurve(2.6);

        this.engineGain = ctx.createGain();
        this.engineGain.gain.value = 0.22;

        this.engineFilter.connect(shaper);
        shaper.connect(this.engineGain);
        this.engineGain.connect(this.master);

        // Three detuned saws an octave apart give a plausible V-ish timbre.
        const harmonics = [0.5, 1, 2];
        const levels = [0.55, 0.85, 0.28];
        for (let i = 0; i < harmonics.length; i++) {
            const osc = ctx.createOscillator();
            osc.type = i === 1 ? 'sawtooth' : 'square';
            osc.frequency.value = 60 * harmonics[i];
            const g = ctx.createGain();
            g.gain.value = levels[i];
            osc.connect(g);
            g.connect(this.engineFilter);
            osc.start();
            this.oscillators.push(osc);
            this.oscGains.push(g);
        }

        // Combustion roughness: noise pushed through the same filter.
        this.engineNoise = ctx.createBufferSource();
        this.engineNoise.buffer = this.noiseBuffer;
        this.engineNoise.loop = true;
        this.engineNoiseGain = ctx.createGain();
        this.engineNoiseGain.gain.value = 0.05;
        this.engineNoise.connect(this.engineNoiseGain);
        this.engineNoiseGain.connect(this.engineFilter);
        this.engineNoise.start();

        // ------------------------------------------------------------ gravel
        this.gravelFilter = ctx.createBiquadFilter();
        this.gravelFilter.type = 'bandpass';
        this.gravelFilter.frequency.value = 1800;
        this.gravelFilter.Q.value = 0.6;
        this.gravelGain = ctx.createGain();
        this.gravelGain.gain.value = 0;
        this.connectNoise(ctx, this.gravelFilter, this.gravelGain);

        // -------------------------------------------------------------- skid
        this.skidFilter = ctx.createBiquadFilter();
        this.skidFilter.type = 'bandpass';
        this.skidFilter.frequency.value = 3100;
        this.skidFilter.Q.value = 3.4;
        this.skidGain = ctx.createGain();
        this.skidGain.gain.value = 0;
        this.connectNoise(ctx, this.skidFilter, this.skidGain);

        // -------------------------------------------------------------- wind
        const windFilter = ctx.createBiquadFilter();
        windFilter.type = 'highpass';
        windFilter.frequency.value = 620;
        this.windGain = ctx.createGain();
        this.windGain.gain.value = 0;
        this.connectNoise(ctx, windFilter, this.windGain);

        // ---------------------------------------------------------- ambience
        const ambFilter = ctx.createBiquadFilter();
        ambFilter.type = 'bandpass';
        ambFilter.frequency.value = 480;
        ambFilter.Q.value = 0.35;
        this.ambienceGain = ctx.createGain();
        this.ambienceGain.gain.value = 0.05;
        this.connectNoise(ctx, ambFilter, this.ambienceGain);

        this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.85, ctx.currentTime, 0.6);
    }

    private connectNoise(ctx: AudioContext, filter: BiquadFilterNode, gain: GainNode): void {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.master!);
        src.start();
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        if (this.ctx && this.master) {
            this.master.gain.setTargetAtTime(muted ? 0.0001 : 0.85, this.ctx.currentTime, 0.08);
        }
    }

    /** Short filtered thump for suspension impacts and collisions. */
    thump(strength: number): void {
        const ctx = this.ctx;
        if (!ctx || !this.master || strength <= 0.02) return;
        const now = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.playbackRate.value = 0.35;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 160 + strength * 220;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(clamp(strength, 0, 1) * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        src.start(now, Math.random() * 1.5, 0.3);
        src.stop(now + 0.32);
    }

    /** Sparse bird / insect blips over the forest bed. */
    private chirp(): void {
        const ctx = this.ctx;
        if (!ctx || !this.master) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const base = 1400 + Math.random() * 1800;
        osc.frequency.setValueAtTime(base, now);
        osc.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.8), now + 0.11);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(now);
        osc.stop(now + 0.2);
    }

    update(dt: number, physics: VehiclePhysics): void {
        const ctx = this.ctx;
        if (!ctx || !this.started) return;
        const now = ctx.currentTime;
        const tc = 0.045;

        const speed = Math.abs(physics.u);
        const rpmNorm = clamp((physics.rpm - 700) / 5500, 0, 1);

        // Engine pitch tracks RPM; the filter opens with load.
        const fundamental = lerp(34, 108, rpmNorm);
        for (let i = 0; i < this.oscillators.length; i++) {
            const mult = [0.5, 1, 2][i];
            this.oscillators[i].frequency.setTargetAtTime(
                fundamental * mult * (1 + (i - 1) * 0.006),
                now,
                tc
            );
        }
        if (this.engineFilter) {
            this.engineFilter.frequency.setTargetAtTime(
                420 + rpmNorm * 2400 + physics.throttle * 900,
                now,
                tc
            );
        }
        if (this.engineGain) {
            const load = 0.16 + physics.throttle * 0.2 + rpmNorm * 0.16;
            // Dip the level briefly on a shift so gear changes are audible.
            this.engineGain.gain.setTargetAtTime(load * (1 - physics.shiftFlash * 0.55), now, tc);
        }
        if (this.engineNoiseGain) {
            this.engineNoiseGain.gain.setTargetAtTime(0.02 + rpmNorm * 0.09, now, tc);
        }

        // Tire noise on gravel.
        if (this.gravelGain && this.gravelFilter) {
            const g = clamp(speed / 34, 0, 1) * (0.25 + physics.surfaceRoughness * 0.75);
            this.gravelGain.gain.setTargetAtTime(g * 0.2, now, 0.08);
            this.gravelFilter.frequency.setTargetAtTime(900 + speed * 42, now, 0.1);
        }

        // Skid rises with rear slip.
        if (this.skidGain) {
            const s = clamp((physics.slipAmount - 0.06) * 3.2, 0, 1) * clamp(speed / 12, 0, 1);
            this.skidGain.gain.setTargetAtTime(s * 0.16, now, 0.06);
        }

        // Wind grows with the square of speed.
        if (this.windGain) {
            const w = clamp((speed * speed) / 3200, 0, 1);
            this.windGain.gain.setTargetAtTime(w * 0.11, now, 0.12);
        }

        // Forest ambience ducks as you go faster.
        if (this.ambienceGain) {
            this.ambienceGain.gain.setTargetAtTime(0.05 * (1 - clamp(speed / 30, 0, 0.85)), now, 0.4);
        }

        // Impacts.
        if (physics.impact > 0.2) this.thump(physics.impact);
        if (physics.landing > 0.25) this.thump(physics.landing * 0.7);

        this.birdTimer -= dt;
        if (this.birdTimer <= 0) {
            this.birdTimer = 1.6 + Math.random() * 5.5 + speed * 0.09;
            if (!this.muted && speed < 26) this.chirp();
        }
    }

    suspend(): void {
        void this.ctx?.suspend();
    }

    resume(): void {
        void this.ctx?.resume();
    }

    dispose(): void {
        for (const o of this.oscillators) {
            try {
                o.stop();
            } catch {
                /* already stopped */
            }
        }
        this.oscillators.length = 0;
        try {
            this.engineNoise?.stop();
        } catch {
            /* already stopped */
        }
        void this.ctx?.close();
        this.ctx = null;
        this.started = false;
    }
}
