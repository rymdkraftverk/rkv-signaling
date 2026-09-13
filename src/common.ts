import pb from 'protobufjs/light'

export const ReadyState = {
  OPEN: 'open',
} as const

export const WEB_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302',
    },
  ],
}

export interface Protobuf {
  descriptor: pb.INamespace;
  schemaKey:  string;
}

export interface ChannelInfo {
  name:      string;
  protobuf?: Protobuf;
}

export type PackagedChannel = ChannelInfo & {
  channel: RTCDataChannel;
}

export type ChannelMap = Record<string, PackagedChannel>

const capitalize = (word: string) => word.charAt(0)
.toUpperCase() + word.slice(1)

export const warnNotFound = (targetName: string) => (targetId: string) => {
  console.warn(`[${capitalize(targetName)} not found] ${targetId}`)
}

export const prettyId = (id: string) => id.substring(0, 4)

const defaultSerialize = JSON.stringify
const defaultDeserialize = JSON.parse

export type Serializer = (data: object) => string | Uint8Array<ArrayBuffer>
export type Deserializer = (data: string | ArrayBuffer) => unknown

const schemaCache = new Map<string, pb.Type>()

const protobufSchema = (descriptor: pb.INamespace, schemaKey: string) => {
  const cacheKey = JSON.stringify([descriptor, schemaKey])
  const cached = schemaCache.get(cacheKey)

  if (cached) return cached

  const schema = pb.Root.fromJSON(descriptor)
.lookupType(schemaKey)
  schemaCache.set(cacheKey, schema)
  return schema
}

const protobufSerializer = ({ descriptor, schemaKey }: Protobuf): Serializer => data => (
  protobufSchema(descriptor, schemaKey)
    .encode(data)
    .finish() as Uint8Array<ArrayBuffer>
)

const protobufDeserializer = ({ descriptor, schemaKey }: Protobuf): Deserializer => data => (
  protobufSchema(descriptor, schemaKey)
    .decode(new Uint8Array(data as ArrayBuffer))
)

const getSerializer = (protobuf?: Protobuf): Serializer => (
  protobuf
    ? protobufSerializer(protobuf)
    : defaultSerialize
)

const getDeserializer = (protobuf?: Protobuf): Deserializer => (
  protobuf
    ? protobufDeserializer(protobuf)
    : data => defaultDeserialize(data as string)
)

export type WsSend = (event: string, payload: unknown) => void

export const wsSend = (ws: { send: (data: string) => void }): WsSend => (event, payload) => {
  ws.send(defaultSerialize({ event, payload }))
}

const sendOverChannel = (channel: RTCDataChannel, data: string | Uint8Array<ArrayBuffer>) => {
  if (typeof data === 'string') {
    channel.send(data)
    return
  }
  channel.send(data)
}

export const rtcSend = (serialize: Serializer, channel: RTCDataChannel, data: object) => {
  sendOverChannel(channel, serialize(data))
}

export const rtcMapSend = (channelMap: ChannelMap) => (
  channelName: string,
  data: object,
) => {
  const { channel, protobuf } = channelMap[channelName]

  if (channel.readyState !== ReadyState.OPEN) {
    console.warn(
      `Attempt to send ${data} to channel ${channel.label} in state ${channel.readyState}`,
    )
    return
  }

  rtcSend(getSerializer(protobuf), channel, data)
}

export const onWsMessage = <T>(
  eventMap: Record<string, (payload: T) => void>,
) => (message: string) => {
  const { event, payload } = defaultDeserialize(message) as { event: string; payload: T }
  const f = eventMap[event]
  if (!f) {
    console.warn(`Unhandled event for message: ${message}`)
    return
  }
  f(payload)
}

export const mappify = <T, K extends keyof T>(key: K, list: T[]) => Object.fromEntries(
  list.map(item => [String(item[key]), item]),
) as Record<string, T>

export const packageChannels = (
  infos: ChannelInfo[],
  channels: RTCDataChannel[],
): PackagedChannel[] => infos.flatMap(info => channels
  .filter(channel => info.name === channel.label)
  .map(channel => ({ ...info, channel })))

export const makeCloseConnections = (connections: { close: () => void }[]) => () => {
  connections.forEach((c) => {
    c.close()
  })
}

export const makeOnRtcMessage = <T>({ protobuf, onData }: {
  protobuf?: Protobuf;
  onData:    (data: T) => unknown;
}) => (message: { data: string | ArrayBuffer }) => onData(
  getDeserializer(protobuf)(message.data) as T,
)
