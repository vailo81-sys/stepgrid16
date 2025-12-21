
export class MidiService {
  private midiAccess: MIDIAccess | null = null;
  private outputs: MIDIOutput[] = [];
  private warnedNoOutputs = false;
  private listeners: (() => void)[] = [];
  
  async initialize(): Promise<void> {
    if (!(navigator as any).requestMIDIAccess) {
      console.warn('Web MIDI API not supported in this browser.');
      return;
    }
    try {
      this.midiAccess = await (navigator as any).requestMIDIAccess();
      this.updateOutputs();
      if (this.midiAccess) {
        this.midiAccess.onstatechange = () => this.updateOutputs();
      }
    } catch (err) {
      console.error('MIDI Access denied or failed', err);
    }
  }

  private updateOutputs() {
    if (!this.midiAccess) return;
    this.outputs = Array.from(this.midiAccess.outputs.values());
    if (this.outputs.length > 0) {
      this.warnedNoOutputs = false;
    }
    this.notifyListeners();
  }

  addListener(cb: () => void) {
    this.listeners.push(cb);
  }

  removeListener(cb: () => void) {
    this.listeners = this.listeners.filter(l => l !== cb);
  }

  private notifyListeners() {
    this.listeners.forEach(l => l());
  }

  getOutputs(): { id: string; name: string }[] {
    return this.outputs.map(o => ({ id: o.id, name: o.name || 'Unknown Device' }));
  }

  sendNoteOn(outputId: string | null, channel: number, note: number, velocity: number) {
    const output = this.getOutput(outputId);
    if (!output) return;
    const status = 0x90 + (channel - 1);
    output.send([status, note, velocity]);
  }

  sendNoteOff(outputId: string | null, channel: number, note: number) {
    const output = this.getOutput(outputId);
    if (!output) return;
    const status = 0x80 + (channel - 1);
    output.send([status, note, 0]);
  }

  sendCC(outputId: string | null, channel: number, cc: number, value: number) {
    const output = this.getOutput(outputId);
    if (!output) return;
    const status = 0xB0 + (channel - 1);
    output.send([status, cc, value]);
  }

  sendAllNotesOff(outputId: string | null, channel: number) {
    const output = this.getOutput(outputId);
    if (!output) return;
    const status = 0xB0 + (channel - 1);
    output.send([status, 123, 0]); // All Notes Off
    output.send([status, 120, 0]); // All Sound Off
  }

  private getOutput(id: string | null): MIDIOutput | undefined {
    if (!this.outputs.length) {
      if (!this.warnedNoOutputs) {
        console.warn('No MIDI outputs available.');
        this.warnedNoOutputs = true;
      }
      return undefined;
    }
    if (!id) return this.outputs[0]; 
    return this.outputs.find(o => o.id === id);
  }
}

export const midiService = new MidiService();
