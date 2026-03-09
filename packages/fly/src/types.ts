// Fly.io Machines API types

export interface FlyMachineConfig {
  image: string
  env?: Record<string, string>
  services?: FlyService[]
  mounts?: FlyMount[]
  restart?: { policy: 'no' | 'always' | 'on-failure'; max_retries?: number }
  auto_destroy?: boolean
  guest?: {
    cpu_kind: 'shared' | 'performance'
    cpus: number
    memory_mb: number
  }
  init?: {
    cmd?: string[]
    entrypoint?: string[]
  }
  metadata?: Record<string, string>
}

export interface FlyService {
  protocol: 'tcp' | 'udp'
  internal_port: number
  autostop?: 'off' | 'stop' | 'suspend'
  autostart?: boolean
  min_machines_running?: number
  ports?: Array<{
    port: number
    handlers: string[]
    force_https?: boolean
  }>
  checks?: FlyCheck[]
}

export interface FlyCheck {
  type: 'http' | 'tcp'
  interval: string
  timeout: string
  port?: number
  path?: string
  method?: string
  grace_period?: string
}

export interface FlyMount {
  volume: string
  path: string
  size_gb?: number
}

export interface FlyMachine {
  id: string
  name: string
  state: 'created' | 'starting' | 'started' | 'stopping' | 'stopped' | 'replacing' | 'destroying' | 'destroyed' | 'suspending' | 'suspended'
  region: string
  instance_id: string
  private_ip: string
  config: FlyMachineConfig
  image_ref: {
    registry: string
    repository: string
    tag: string
    digest: string
  }
  created_at: string
  updated_at: string
  events?: Array<{
    type: string
    status: string
    timestamp: number
  }>
  checks?: Array<{
    name: string
    status: string
    output: string
    updated_at: string
  }>
}

export interface FlyApp {
  id: string
  name: string
  status: string
  organization: { slug: string }
  network?: string
}

export interface FlyVolume {
  id: string
  name: string
  state: string
  size_gb: number
  region: string
  zone: string
  encrypted: boolean
  created_at: string
  attached_machine_id?: string
}

export interface CreateMachineOptions {
  name?: string
  region: string
  config: FlyMachineConfig
  skip_launch?: boolean
  lease_ttl?: number
}

export interface CreateVolumeOptions {
  name: string
  region: string
  size_gb: number
  encrypted?: boolean
}
