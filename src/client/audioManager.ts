export interface PlayOptions {
    loop?: boolean;
    volume?: number;
}

export interface SpatialPlayOptions extends PlayOptions {
    maxDistance?: number;
    falloff?: number;
}

interface ActiveLoop {
    source: AudioBufferSourceNode;
    gain: GainNode;
}

interface TrackedSpatial {
    source: AudioBufferSourceNode;
    gain: GainNode;
    panner: StereoPannerNode;
    worldX: number;
    maxDistance: number;
    baseVolume: number;
    falloff: number;
    alive: boolean;
}

const DEFAULT_MAX_DISTANCE = 1500;
const DEFAULT_FALLOFF = 1;

class _AudioManager {
    private ctx: AudioContext | null = null;
    private buffers: Map<string, AudioBuffer> = new Map();
    private activeLoops: Map<string, ActiveLoop> = new Map();
    private spatialSounds: TrackedSpatial[] = [];
    private masterGain: GainNode | null = null;

    private getPlayerCenterX: (() => number) | null = null;

    private ensureContext(): AudioContext {
        if (!this.ctx) {
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
        }
        if (this.ctx.state === "suspended") {
            this.ctx.resume();
        }
        return this.ctx;
    }

    setPlayerPositionGetter(fn: () => number): void {
        this.getPlayerCenterX = fn;
    }

    /**
     * Pre-load a sound file and store it under `alias`.
     *
     * @param alias Short name you'll reference later ("hit", "music", etc.)
     * @param filename File inside `res/audio/`, e.g. `"hit.wav"`.
     */
    async load(alias: string, filename: string): Promise<void> {
        const ctx = this.ensureContext();
        const url = `res/audio/${filename}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`[AudioManager] Failed to fetch "${url}" (${response.status})`);
                return;
            }
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            this.buffers.set(alias, audioBuffer);
        } catch (err) {
            console.warn(`[AudioManager] Error loading "${alias}" from "${url}":`, err);
        }
    }

    play(alias: string, options: PlayOptions = {}): void {
        this.playInternal(alias, options.volume ?? 1, options.loop ?? false);
    }

    playAtX(alias: string, worldX: number, options: SpatialPlayOptions = {}): void {
        if (!this.getPlayerCenterX) {
            console.warn("[AudioManager] playAtX called before setPlayerPositionGetter - playing at full volume.");
            this.play(alias, options);
            return;
        }

        const ctx = this.ensureContext();
        const playerX = this.getPlayerCenterX();
        const distance = Math.abs(worldX - playerX);
        const maxDist = options.maxDistance ?? DEFAULT_MAX_DISTANCE;
        const baseVol = options.volume ?? 1;
        const falloff = options.falloff ?? DEFAULT_FALLOFF;

        // Initial volume with falloff curve
        const t = Math.max(0, 1 - distance / maxDist);
        const initialVolume = baseVol * Math.pow(t, falloff);

        // Initial stereo pan: -1 (left) to +1 (right)
        const initialPan = Math.max(-1, Math.min(1, (worldX - playerX) / maxDist));

        const result = this.playInternal(alias, initialVolume, options.loop ?? false);
        if (!result) return;

        // Create a stereo panner and splice it into the chain
        // Chain: source to gain to panner to masterGain to destination
        const panner = ctx.createStereoPanner();
        panner.pan.value = initialPan;

        // Rewire: disconnect gain from master, insert panner between them
        result.gain.disconnect(this.masterGain!);
        result.gain.connect(panner);
        panner.connect(this.masterGain!);

        // Track this sound so update() adjusts volume + pan each frame
        const tracked: TrackedSpatial = {
            source: result.source,
            gain: result.gain,
            panner,
            worldX,
            maxDistance: maxDist,
            baseVolume: baseVol,
            falloff,
            alive: true,
        };

        result.source.onended = () => {
            tracked.alive = false;
        };

        this.spatialSounds.push(tracked);
    }

    update(): void {
        if (!this.getPlayerCenterX) return;

        const playerX = this.getPlayerCenterX();

        // Walk backwards so we can splice without index issues
        for (let i = this.spatialSounds.length - 1; i >= 0; i--) {
            const s = this.spatialSounds[i];

            // Sound finished playing. Remove it
            if (!s.alive) {
                this.spatialSounds.splice(i, 1);
                continue;
            }

            const distance = Math.abs(s.worldX - playerX);

            // Volume with falloff curve
            const t = Math.max(0, 1 - distance / s.maxDistance);
            s.gain.gain.value = s.baseVolume * Math.pow(t, s.falloff);

            // Stereo pan: -1 (full left) to +1 (full right)
            s.panner.pan.value = Math.max(-1, Math.min(1, (s.worldX - playerX) / s.maxDistance));
        }
    }

    stopLoop(alias: string): void {
        const loop = this.activeLoops.get(alias);
        if (loop) {
            loop.source.stop();
            this.activeLoops.delete(alias);
        }
    }

    stopAllLoops(): void {
        this.activeLoops.forEach((loop) => loop.source.stop());
        this.activeLoops.clear();
    }

    setMasterVolume(v: number): void {
        this.ensureContext();
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, v));
        }
    }

    private playInternal(alias: string, volume: number, loop: boolean,): { source: AudioBufferSourceNode; gain: GainNode } | null {
        const ctx = this.ensureContext();
        const buffer = this.buffers.get(alias);
        if (!buffer) {
            console.warn(`[AudioManager] Sound "${alias}" not loaded.`);
            return null;
        }

        // If this alias is already looping, stop the old instance first
        if (loop) this.stopLoop(alias);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;

        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, volume));

        source.connect(gain);
        gain.connect(this.masterGain!);

        source.start(0);

        if (loop) {
            this.activeLoops.set(alias, { source, gain });
            source.onended = () => {
                this.activeLoops.delete(alias);
            };
        }

        return { source, gain };
    }
}

let registered = false;

export async function loadSounds(): Promise<void> {
	if (!registered) {
        await AudioManager.load("hitBrick", "hitBrick.wav");
        await AudioManager.load("tempSong", "tempSong.mp3");
		registered = true;
    }
}

export const AudioManager = new _AudioManager();
