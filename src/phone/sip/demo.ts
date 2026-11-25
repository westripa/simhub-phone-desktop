import type { Account, Call, Emit, Outcome, Phase, Transport } from '../types'

// This transport never accesses a socket, a credential or a media device.
export class DemoPhone implements Transport {
  private call: Call | null = null
  private timers: ReturnType<typeof setTimeout>[] = []
  private connected = false
  constructor(private emit: Emit) {}
  async connect(_account: Account) { this.connected = true; this.emit({ type: 'connection', status: 'registered' }) }
  async disconnect() { this.end('cancelled'); this.connected = false; this.emit({ type: 'connection', status: 'offline' }) }
  async dial(number: string, meta?: { lineId?: string; ownNumber?: string }) {
    if (!this.connected || this.call) return
    this.begin(number, 'outgoing', 'dialing', meta)
    this.timers.push(setTimeout(() => this.phase('ringing'), 650))
    this.timers.push(setTimeout(() => this.phase('connected'), 1900))
  }
  incoming(meta?: { lineId?: string; ownNumber?: string }) {
    if (!this.connected || this.call) return
    this.begin('9198', 'incoming', 'incoming', meta)
    this.timers.push(setTimeout(() => this.end('missed'), 30000))
  }
  async answer() { if (this.call?.phase === 'incoming') { this.clear(); this.phase('connected') } }
  async hangup() {
    if (!this.call) return
    this.end(this.call.phase === 'connected' ? 'completed' : this.call.direction === 'incoming' ? 'rejected' : 'cancelled')
  }
  mute(muted: boolean) { this.emit({ type: 'mute', muted }) }
  async sendDtmf(_digit: string) {}
  async setHold(held: boolean) { if (this.call?.phase === 'connected') this.emit({ type: 'hold', held }) }
  private begin(peer: string, direction: Call['direction'], phase: Phase, meta?: { lineId?: string; ownNumber?: string }) {
    this.call = { id: crypto.randomUUID(), peer, direction, phase, started: Date.now(), ...meta }
    this.emit({ type: 'call', call: this.call })
  }
  private phase(phase: Phase) {
    if (!this.call) return
    this.call = { ...this.call, phase, answered: phase === 'connected' ? Date.now() : this.call.answered }
    this.emit({ type: 'call', call: this.call })
  }
  private clear() { this.timers.forEach(clearTimeout); this.timers = [] }
  private end(outcome: Outcome) {
    this.clear()
    if (!this.call) return
    const id = this.call.id
    this.call = null
    this.emit({ type: 'end', id, outcome, at: Date.now() })
  }
}
