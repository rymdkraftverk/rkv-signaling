import { useEffect, useEffectEvent, useRef, useState } from 'react'
import runInitiator, { type ChannelConfig } from './runInitiator'

export type Status = 'lobby' | 'connecting' | 'connected'

export type Notice = {
  text: string;
  type: 'error' | 'warning';
}

export type Send = (channelName: string, data: object) => void

export type JoinOptions = {
  wsAddress:       string;
  channelConfigs:  ChannelConfig[];
  onData:          (data: never) => unknown;
  timeoutSeconds?: number;
  onTimeout?:      () => void;
}

const STORAGE_KEY = 'gameCode'
const CODE_LENGTH = 4

const codeFromUrl = () => new URLSearchParams(window.location.search)
.get('code') ?? ''

const lastCode = () => sessionStorage.getItem(STORAGE_KEY) ?? ''

const rememberCode = (code: string) => {
  sessionStorage.setItem(STORAGE_KEY, code)
}

const writeCodeToUrl = (code: string) => {
  window.history.pushState({ gameCode: code }, '', `?code=${code}`)
}

type Connection = { type?: string }

const cellularNotice = (): Notice | null => {
  const browser = navigator as Navigator & {
    connection?:       Connection;
    mozConnection?:    Connection;
    webkitConnection?: Connection;
  }
  const connection = browser.connection || browser.mozConnection || browser.webkitConnection

  return connection?.type === 'cellular'
    ? { text: 'Connect to WiFi for best experience', type: 'warning' }
    : null
}

const alertIfNoRtc = () => {
  if (typeof RTCPeerConnection === 'undefined') {
    alert(
      'Unfortunately the game cannot be played in this browser. '
      + 'See list of supported browsers here: https://caniuse.com/#search=webrtc',
    )
  }
}

/*
  The join flow every controller shares: a game code from the url or the last
  session, the connection with its timeout, and the notices that come out of
  it. Game events arrive through onData as before; the game decides what they
  mean.
*/
export const useJoin = ({
  wsAddress,
  channelConfigs,
  onData,
  timeoutSeconds = 20,
  onTimeout,
}: JoinOptions) => {
  const [initialCode] = useState(codeFromUrl)
  const [status, setStatus] = useState<Status>(initialCode ? 'connecting' : 'lobby')
  const statusRef = useRef(status)
  const [gameCode, storeGameCode] = useState(() => initialCode || lastCode())
  const [notice, setNotice] = useState<Notice | null>(() => (initialCode ? null : cellularNotice()))
  const [send, setSend] = useState<{ f: Send }>({ f: () => {} })

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const fail = (message: string) => {
    setStatus('lobby')
    setNotice({ text: message, type: 'error' })
  }

  const connect = (code: string) => {
    rememberCode(code)
    writeCodeToUrl(code)

    setTimeout(() => {
      if (statusRef.current === 'connecting') {
        fail('Connection failed, joining Wi-Fi may help')
        onTimeout?.()
      }
    }, timeoutSeconds * 1000)

    runInitiator({
      channelConfigs,
      onClose: () => {
        fail('Connection failed')
      },
      onData,
      receiverId: code,
      wsAddress,
    })
      .then((f) => {
        setSend({ f })
        setStatus('connected')
      })
      .catch((error: { cause?: string }) => {
        if (error.cause === 'NOT_FOUND') {
          fail(`Game with code ${code} not found`)
          return
        }
        console.error(error)
      })
  }

  const join = () => {
    navigator.vibrate?.(1) // To trigger accept dialog in firefox
    setStatus('connecting')
    setNotice(null)
    connect(gameCode)
  }

  const setGameCode = (value: string) => {
    storeGameCode(value.slice(0, CODE_LENGTH)
      .toUpperCase())
  }

  const connectFromUrl = useEffectEvent(() => {
    if (initialCode) {
      connect(initialCode)
    }
  })

  useEffect(() => {
    alertIfNoRtc()
    connectFromUrl()
  }, [])

  return {
    status,
    gameCode,
    setGameCode,
    notice,
    dismissNotice: () => {
      setNotice(null)
    },
    join,
    fail,
    send: send.f,
  }
}
