import Event from './event'
import {
  WEB_RTC_CONFIG,
  makeCloseConnections,
  makeOnRtcMessage,
  mappify,
  onWsMessage,
  packageChannels,
  prettyId,
  rtcMapSend,
  warnNotFound,
  wsSend,
  type ChannelInfo,
  type Protobuf,
  type WsSend,
} from './common'

// state
let closeConnections = () => {}
let id: string | null = null
// end state

export type ChannelConfig = {
  name:      string;
  config?:   RTCDataChannelInit;
  protobuf?: Protobuf;
}

export type InitOptions = {
  channelConfigs: ChannelConfig[];
  onClose:        (event: Event) => void;
  onData:         (data: never) => unknown;
  receiverId:     string;
  wsAddress:      string;
}

const sendOffer = ({ channelInfos, receiverId, rtc, send }: {
  channelInfos: ChannelInfo[];
  receiverId:   string;
  rtc:          RTCPeerConnection;
  send:         WsSend;
}) => () => {
  send(
    Event.OFFER,
    {
      channelInfos,
      offer: rtc.localDescription,
      receiverId,
    },
  )
}

const onIceConnectionStateChange = (event: Event) => {
  const state = (event.currentTarget as RTCPeerConnection).iceConnectionState
  console.log(`[ICE state change] ${state}`)
  if (state === 'disconnected') {
    closeConnections()
  }
}

const onIceCandidate = (allReceived: () => void) => (
  { candidate }: RTCPeerConnectionIceEvent,
) => {
  if (candidate == null) {
    console.log('[Ice Candidate] Last retrieved')
    allReceived()
    return
  }
  console.log('[Ice Candidate]')
}

const createOffer = (rtc: RTCPeerConnection) => async () => {
  const offer = await rtc.createOffer()
  await rtc.setLocalDescription(offer)
}

const onReceiverNotFound = (
  onFailure: (reason: { cause: string }) => void,
) => (receiverId: string) => {
  warnNotFound('receiver')(receiverId)
  closeConnections()
  onFailure({ cause: 'NOT_FOUND' })
}

const onInitiatorId = (initiatorId: string) => {
  id = initiatorId
  console.log(`[Id] ${prettyId(id)}`)
}

const setUpChannel = (rtc: RTCPeerConnection) => ({
  name,
  config,
  protobuf,
  onClose,
  onData,
}: ChannelConfig & Pick<InitOptions, 'onClose' | 'onData'>) => {
  const channel = rtc.createDataChannel(name, config)

  channel.binaryType = 'arraybuffer'

  channel.onerror = (event) => {
    console.error(event)
    closeConnections()
  }

  channel.onclose = (event) => {
    console.warn(event)
    onClose(event)
  }

  channel.onmessage = makeOnRtcMessage({ protobuf, onData })

  // Channel considered "set up" once it's opened
  return new Promise<RTCDataChannel>((resolve) => {
    channel.onopen = () => {
      console.log(`[Data channel] ${channel.label}`)
      resolve(channel)
    }
  })
}

const init = ({
  channelConfigs,
  onClose,
  onData,
  receiverId,
  wsAddress,
}: InitOptions) => new Promise<ReturnType<typeof rtcMapSend>>((resolve, reject) => {
  const rtc = new RTCPeerConnection(WEB_RTC_CONFIG)
  const ws = new WebSocket(wsAddress)

  const channelInfos: ChannelInfo[] = channelConfigs.map(
    ({ name, protobuf }) => ({ name, protobuf }),
  )

  const thunkedSendOffer = sendOffer({
    channelInfos,
    receiverId,
    rtc,
    send: wsSend(ws),
  })

  rtc.onicecandidate = onIceCandidate(thunkedSendOffer)

  // Monitor disconnects
  rtc.oniceconnectionstatechange = onIceConnectionStateChange

  ws.onopen = createOffer(rtc)
  ws.onmessage = message => onWsMessage<never>({
    [Event.ANSWER]: (answer: RTCSessionDescriptionInit) => {
      rtc.setRemoteDescription(answer)
    },
    [Event.NOT_FOUND]: onReceiverNotFound(reject),
    [Event.CLIENT_ID]: onInitiatorId,
  })(message.data)

  closeConnections = makeCloseConnections([rtc, ws])

  Promise
    .all(channelConfigs.map(config => setUpChannel(rtc)({ ...config, onData, onClose })))
    .then((channels) => {
      ws.close() // No longer needed after signaling
      resolve(rtcMapSend(mappify('name', packageChannels(channelInfos, channels))))
    })
})

export default init
