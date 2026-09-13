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
  wsSend,
  type ChannelInfo,
  type PackagedChannel,
  type WsSend,
} from './common'

const InitatorState = {
  NEW:   'new',
  READY: 'ready',
} as const

type Initiator = {
  alive:            boolean;
  id:               string;
  offer:            RTCSessionDescriptionInit;
  rtc:              RTCPeerConnection;
  state:            typeof InitatorState[keyof typeof InitatorState];
  closeConnections: () => void;
}

export type JoinedInitiator = {
  id:        string;
  setOnData: (onData: (data: never) => unknown) => void;
  send:      ReturnType<typeof rtcMapSend>;
  close:     () => void;
}

export type InitOptions = {
  wsAddress:        string;
  receiverId:       string;
  onInitiatorJoin:  (initiator: JoinedInitiator) => void;
  onInitiatorLeave: (id: string) => void;
}

// state
let send: WsSend = () => {}

const outputEvents = {
  onInitiatorJoin:  (_initiator: JoinedInitiator) => {},
  onInitiatorLeave: (_id: string) => {},
}

let initiators: Initiator[] = []
// end state

const createInitiator = (initiatorId: string, offer: RTCSessionDescriptionInit) => {
  const rtc = new RTCPeerConnection(WEB_RTC_CONFIG)

  const initiator: Initiator = {
    alive:            true,
    id:               initiatorId,
    offer,
    rtc,
    state:            InitatorState.NEW,
    closeConnections: makeCloseConnections([rtc]),
  }

  initiators = initiators.concat(initiator)
  return initiator
}

const removeInitiator = (id: string) => {
  initiators = initiators.filter(c => c.id !== id)
}

const getInitiator = (id: string) => initiators.find(x => x.id === id)

const killInitiator = (id: string) => {
  const initiator = getInitiator(id)
  if (!initiator) return

  initiator.closeConnections()
  outputEvents.onInitiatorLeave(id)
  removeInitiator(id)
}

const onIceConnectionStateChange = (initiatorId: string) => (event: Event) => {
  const state = (event.currentTarget as RTCPeerConnection).iceConnectionState
  console.log(`[ICE state change] ${prettyId(initiatorId)} ${state}`)
  if (state === 'disconnected') {
    killInitiator(initiatorId)
  }
}

const onIceCandidate = (initiator: Initiator) => (
  { candidate }: RTCPeerConnectionIceEvent,
) => {
  if (candidate) {
    console.log(`[Ice candidate] ${prettyId(initiator.id)}`)
    return
  }

  console.log(`[Sending answer] ${prettyId(initiator.id)} Last candidate retrieved`)
  send(Event.ANSWER, { answer: initiator.rtc.localDescription, initiatorId: initiator.id })
}

const createAnswer = async (rtc: RTCPeerConnection, offer: RTCSessionDescriptionInit) => {
  await rtc.setRemoteDescription(new RTCSessionDescription(offer))
  const answer = await rtc.createAnswer()
  await rtc.setLocalDescription(answer)
  return answer
}

const setUpChannels = (
  rtc: RTCPeerConnection,
  channelNames: string[],
  initiator: Initiator,
) => {
  let openChannels: RTCDataChannel[] = []

  return new Promise<RTCDataChannel[]>((resolve) => {
    rtc.ondatachannel = ({ channel }) => {
      // To have consistent binaryType between platforms.
      // Standard says "blob" should be the standard,
      // but Chrome uses "arraybuffer" despite this:
      // https://stackoverflow.com/a/53328431/1859989
      channel.binaryType = 'arraybuffer'

      channel.onopen = () => {
        console.log(`[Data channel] ${prettyId(initiator.id)} ${channel.label}`)
        openChannels = openChannels.concat([channel])

        const openedNames = openChannels.map(c => c.label)
        const allOpened = openedNames.length === channelNames.length
          && openedNames.every((name, i) => name === channelNames[i])

        if (allOpened) {
          resolve(openChannels)
        }
      }

      channel.onclose = () => {
        console.log(`[Channel closed] ${prettyId(initiator.id)} ${channel.label}`)
      }
    }
  })
}

const makeSetOnData = (
  channels: PackagedChannel[],
) => (onData: (data: never) => unknown) => {
  channels.forEach(({ channel, protobuf }) => {
    channel.onmessage = makeOnRtcMessage({ protobuf, onData })
  })
}

const outputExternalChannels = ({ channels, initiator, rtc }: {
  channels:  PackagedChannel[];
  initiator: Initiator;
  rtc:       RTCPeerConnection;
}) => {
  outputEvents.onInitiatorJoin({
    id:        initiator.id,
    setOnData: makeSetOnData(channels),
    send:      rtcMapSend(mappify('name', channels)),
    close:     () => rtc.close(),
  })
}

// First point of contact from initiator
const onOffer = ({ initiatorId, channelInfos, offer }: {
  initiatorId:  string;
  channelInfos: ChannelInfo[];
  offer:        RTCSessionDescriptionInit;
}) => {
  console.log(`[Offer] ${prettyId(initiatorId)}`)

  const initiator = createInitiator(initiatorId, offer)
  const { rtc } = initiator

  // Start collecting receiver candidates to be sent to this initiator
  rtc.onicecandidate = onIceCandidate(initiator)

  // Monitor disconnects
  rtc.oniceconnectionstatechange = onIceConnectionStateChange(initiatorId)

  // Wait for all known channels to be opened before considering initiator
  // to have joined
  const channelNames = channelInfos.map(({ name }) => name)
  setUpChannels(rtc, channelNames, initiator)
    .then((channels) => {
      initiator.state = InitatorState.READY

      outputExternalChannels({
        channels: packageChannels(channelInfos, channels),
        initiator,
        rtc,
      })
    })

  createAnswer(rtc, offer)
}

const init = ({
  wsAddress,
  receiverId,
  onInitiatorJoin,
  onInitiatorLeave,
}: InitOptions) => {
  outputEvents.onInitiatorJoin = onInitiatorJoin
  outputEvents.onInitiatorLeave = onInitiatorLeave

  const ws = new WebSocket(wsAddress)
  send = wsSend(ws)
  ws.onopen = () => {
    send(Event.RECEIVER_UPGRADE, receiverId)
  }

  ws.onmessage = message => onWsMessage<never>({
    [Event.OFFER]:     onOffer,
    [Event.CLIENT_ID]: (clientId: string) => console.log(`[Id] ${prettyId(clientId)}`),
  })(message.data)
}

export default init
