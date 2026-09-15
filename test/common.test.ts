import * as common from '../src/common'

// Mute logging
beforeEach(() => {
  vi.spyOn(console, 'error')
.mockImplementation(() => {})
  vi.spyOn(console, 'log')
.mockImplementation(() => {})
  vi.spyOn(console, 'warn')
.mockImplementation(() => {})
})

test('makeCloseConnections', () => {
  const connections = [
    { close: vi.fn() },
    { close: vi.fn() },
    { close: vi.fn() },
    { close: vi.fn() },
  ]

  common.makeCloseConnections(connections)()

  const allCalledOnce = connections.every(c => c.close.mock.calls.length === 1)
  expect(allCalledOnce)
    .toBe(true)
})

// Without protobuf
test('makeOnRtcMessage', () => {
  const options = {
    onData: ({ foo }: { foo: number }) => foo * 3,
  }
  const message = {
    data: '{ "foo": 2 }',
  }
  expect(common.makeOnRtcMessage(options)(message))
    .toEqual(6)
})

test('mappify', () => {
  const keyName = 'name'
  const listOfObjects = [
    {
      name:  'foo',
      color: 'blue',
    },
    {
      name:  'bar',
      color: 'green',
    },
    {
      name:  'baz',
      color: 'yellow',
    },
  ]

  const object = {
    foo: {
      name:  'foo',
      color: 'blue',
    },
    bar: {
      name:  'bar',
      color: 'green',
    },
    baz: {
      name:  'baz',
      color: 'yellow',
    },
  }

  expect(common.mappify(
    keyName,
    listOfObjects,
  ))
    .toEqual(object)
})

test('onWsMessage', () => {
  const f = vi.fn()
  const g = vi.fn()

  const eventMap = { f, g }
  const message = '{ "event": "f","payload": 2 }'

  common.onWsMessage(eventMap)(message)

  expect(f)
    .toHaveBeenCalled()
  expect(g)
    .not.toHaveBeenCalled()
})

test('packageChannels', () => {
  const channelInfos = [{
    name:   'reliable',
    schema: 'JSON',
  }, {
    name:   'unreliable',
    schema: 'protobuf',
  }]

  const channels = [{
    label: 'internal',
    rtc:   'RTC',
  }, {
    label: 'reliable',
    rtc:   'RTC',
  }, {
    label: 'unreliable',
    rtc:   'RTC',
  }]

  const packagedChannels = [{
    channel: {
      label: 'reliable',
      rtc:   'RTC',
    },
    name:   'reliable',
    schema: 'JSON',
  }, {
    channel: {
      label: 'unreliable',
      rtc:   'RTC',
    },
    name:   'unreliable',
    schema: 'protobuf',
  }]

  expect(common.packageChannels(
    channelInfos,
    channels as unknown as RTCDataChannel[],
  ))
    .toEqual(packagedChannels)
})

test('prettyId', () => {
  expect(common.prettyId('abcdefgh'))
    .toEqual('abcd')
})

// Without protobuf
test('rtcMapSend', () => {
  const f = vi.fn()
  const g = vi.fn()

  const channelMap = {
    foo: {
      channel: {
        send:       g,
        readyState: common.ReadyState.OPEN,
      },
    },
    bar: {
      channel: {
        send:       f,
        readyState: common.ReadyState.OPEN,
      },
    },
  }
  const channelName = 'bar'
  const data = { foo: 2 }

  common.rtcMapSend(channelMap as unknown as common.ChannelMap)(
    channelName,
    data,
  )

  expect(f)
    .toHaveBeenCalledWith('{"foo":2}')
  expect(g)
    .not.toHaveBeenCalled()
})

test('rtcSend', () => {
  const channel = {
    send: vi.fn(),
  }
  const data = { foo: 'bar' }
  const serializedData = '{"foo":"bar"}'

  common.rtcSend(
    JSON.stringify,
    channel as unknown as RTCDataChannel,
    data,
  )

  expect(channel.send)
    .toHaveBeenCalledWith(serializedData)
})

test('warnNotFound', () => {
  common.warnNotFound('foo')('4321')
  expect(console.warn)
    .toHaveBeenCalledWith('[Foo not found] 4321')
})

test('wsSend', () => {
  const f = vi.fn()

  const ws = {
    send: f,
  }
  const event = 'foo'
  const payload = 'bar'

  common.wsSend(ws)(
    event,
    payload,
  )

  expect(f)
    .toHaveBeenCalledWith('{"event":"foo","payload":"bar"}')
})


const fakeRtc = () => {
  const target = new EventTarget() as EventTarget & { iceGatheringState: RTCIceGatheringState }
  target.iceGatheringState = 'gathering'
  const candidate = () => {
    target.dispatchEvent(Object.assign(new Event('icecandidate'), { candidate: {} }))
  }
  const complete = () => {
    target.iceGatheringState = 'complete'
    target.dispatchEvent(new Event('icegatheringstatechange'))
  }
  return { rtc: target as unknown as RTCPeerConnection, candidate, complete }
}

const track = (promise: Promise<void>) => {
  const state = { done: false }
  promise.then(() => {
    state.done = true
  })
  return state
}

const flush = () => vi.advanceTimersByTimeAsync(0)

describe('candidatesGathered', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('resolves as soon as gathering completes', async () => {
    const { rtc, complete } = fakeRtc()
    const gathered = track(common.candidatesGathered(rtc))
    complete()
    await flush()
    expect(gathered.done)
      .toBe(true)
  })

  test('resolves once patience runs out with a candidate in hand', async () => {
    const { rtc, candidate } = fakeRtc()
    const gathered = track(common.candidatesGathered(rtc))
    candidate()
    await vi.advanceTimersByTimeAsync(common.ICE_GATHERING_PATIENCE_MILLISECONDS - 1)
    expect(gathered.done)
      .toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(gathered.done)
      .toBe(true)
  })

  test('keeps waiting past patience until a candidate arrives', async () => {
    const { rtc, candidate } = fakeRtc()
    const gathered = track(common.candidatesGathered(rtc))
    await vi.advanceTimersByTimeAsync(common.ICE_GATHERING_PATIENCE_MILLISECONDS * 5)
    expect(gathered.done)
      .toBe(false)
    candidate()
    await flush()
    expect(gathered.done)
      .toBe(true)
  })
})
