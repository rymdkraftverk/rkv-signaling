import { act, renderHook } from '@testing-library/react'
import runInitiator from '../src/runInitiator'
import { useJoin } from '../src/react'

vi.mock('../src/runInitiator', () => ({ default: vi.fn() }))

const connecting = vi.mocked(runInitiator)

const options = {
  wsAddress:      'ws://localhost:1',
  channelConfigs: [{ name: 'reliable' }],
  onData:         () => {},
}

const openPage = (query: string) => {
  window.history.replaceState({}, '', query)
}

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  connecting.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  openPage('/')
})

test('gives up on a connection that never opens', () => {
  openPage('?code=ABCD')
  connecting.mockReturnValue(new Promise(() => {}))
  const onTimeout = vi.fn()

  const { result } = renderHook(() => useJoin({ ...options, onTimeout }))

  expect(result.current.status)
    .toBe('connecting')

  act(() => {
    vi.advanceTimersByTime(20_000)
  })

  expect(result.current.status)
    .toBe('lobby')
  expect(result.current.notice)
    .toEqual({ text: 'Connection failed, joining Wi-Fi may help', type: 'error' })
  expect(onTimeout)
    .toHaveBeenCalledTimes(1)
})

test('keeps a connection that opened in time', async () => {
  openPage('?code=ABCD')
  const send = vi.fn()
  connecting.mockResolvedValue(send)

  const { result } = renderHook(() => useJoin(options))

  await act(async () => {
    await Promise.resolve()
  })
  act(() => {
    vi.advanceTimersByTime(20_000)
  })

  expect(result.current.status)
    .toBe('connected')
  expect(result.current.notice)
    .toBeNull()
  expect(result.current.send)
    .toBe(send)
})

test('tells the player when nobody has the code', async () => {
  openPage('?code=ABCD')
  connecting.mockRejectedValue({ cause: 'NOT_FOUND' })

  const { result } = renderHook(() => useJoin(options))

  await act(async () => {
    await Promise.resolve()
  })

  expect(result.current.status)
    .toBe('lobby')
  expect(result.current.notice)
    .toEqual({ text: 'Game with code ABCD not found', type: 'error' })
})

test('joins on request with the code typed in', () => {
  connecting.mockReturnValue(new Promise(() => {}))

  const { result } = renderHook(() => useJoin(options))

  expect(result.current.status)
    .toBe('lobby')

  act(() => {
    result.current.setGameCode('abcdef')
  })
  expect(result.current.gameCode)
    .toBe('ABCD')

  act(() => {
    result.current.join()
  })

  expect(result.current.status)
    .toBe('connecting')
  expect(connecting)
    .toHaveBeenCalledWith(expect.objectContaining({ receiverId: 'ABCD' }))
  expect(sessionStorage.getItem('gameCode'))
    .toBe('ABCD')
  expect(window.location.search)
    .toBe('?code=ABCD')
})

test('offers the last code again next time', () => {
  sessionStorage.setItem('gameCode', 'WXYZ')

  const { result } = renderHook(() => useJoin(options))

  expect(result.current.gameCode)
    .toBe('WXYZ')
  expect(result.current.status)
    .toBe('lobby')
})
