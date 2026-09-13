import { useEffect, type ComponentType, type ReactNode } from 'react'
import styled, { css, keyframes } from 'styled-components'

export const FullHeight = styled.div`
  height: 100dvh;
`

export const IOSDisableDoubleTap = ({ children, className }: {
  children:   ReactNode;
  className?: string;
}) => (
  <div
    className={className}
    style={{ touchAction: 'manipulation' }}
    // Empty click listener to prevent double tap to zoom on iOS
    onClick={() => {}}
  >
    {children}
  </div>
)

const preventDefault = (e: Event) => {
  e.preventDefault()
}

// Render on every page that needs to lock scroll
export const ScrollLock = () => {
  useEffect(() => {
    setTimeout(() => {
      // -1000 is an arbitrary number that definitely scrolls to the top
      window.scrollTo(0, -1000)
      // The lowest delay that worked on iOS Safari, enough for the address bar to show
    }, 290)

    // Prevent scrolling and two finger zoom on iOS
    document.addEventListener('touchmove', preventDefault, { passive: false })
    return () => {
      document.removeEventListener('touchmove', preventDefault)
    }
  }, [])

  return null
}

const TOAST_VISIBLE_MILLISECONDS = 5000

const toastBackground = {
  error:   '#d0342c',
  warning: '#d08b2c',
}

const Banner = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
  padding: 0.6em;
  text-align: center;
  font-size: 3vw;
  color: #eee;
`

export const Toast = ({ onHide, text, type }: {
  onHide: () => void;
  text:   string;
  type:   keyof typeof toastBackground;
}) => {
  useEffect(() => {
    const timer = setTimeout(onHide, TOAST_VISIBLE_MILLISECONDS)
    return () => {
      clearTimeout(timer)
    }
  }, [onHide])

  return <Banner style={{ background: toastBackground[type] }}>{text}</Banner>
}

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`

const Spinner = styled.div`
  position: absolute;
  left: 50%;
  z-index: 1;
  margin: -75px 0 0 -75px;
  border: 16px solid #f3f3f3;
  border-radius: 50%;
  border-top: 16px solid #3498db;
  width: 120px;
  height: 120px;
  animation: ${spin} 2s linear infinite;
`

export const LockerRoomLoader = () => (
  <div>
    <ScrollLock />
    <Spinner style={{ top: '50dvh' }} />
  </div>
)

const TurnPhoneContent = styled.div`
  color: white;
  text-align: center;
  margin-bottom: auto;
  display: flex;
  height: 100%;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`

const TurnPhonePage = styled(FullHeight)`
  display: flex;
  flex-direction: column;
`

const TurnPhoneGif = styled.img`
  width: 100vw;
  height: auto;
  margin-bottom: -80px;
  margin-top: -200px;
`

export const TurnPhone = ({ gif, sound, logo }: {
  gif:   string;
  sound: string;
  logo?: ReactNode;
}) => {
  useEffect(() => () => {
    new Audio(sound)
.play()
      .catch((error) => {
        console.error('Turn phone sound failed: ', error)
      })
  }, [sound])

  return (
    <TurnPhonePage>
      {logo}
      <TurnPhoneContent>
        <TurnPhoneGif src={gif} />
        <div>Please turn your phone to landscape</div>
      </TurnPhoneContent>
    </TurnPhonePage>
  )
}

const PLACEHOLDER = 'Code'
const CODE_LENGTH = 4

const Columns = styled.div`
  display: flex;
`

const Column = styled.div`
  width: 50vw;
  display: flex;
  align-items: center;
  justify-content: center;
`

const GameCodeInput = styled.input`
  letter-spacing: 0.5em;
  font-size: 5vw;
  text-align: center;
  text-decoration: none;
  font-family: 'patchy-robots';
  outline: none;
  border: 0;
  background: transparent;
  border-bottom: 3px solid #4085af;
  width: 70%;
  caret-color: #4085af;
  color: #4085af;
`

// Style for the join button a game passes in, on top of its own button look
export const joinButtonStyle = css<{ disabled?: boolean }>`
  color: #4085af;
  opacity: ${({ disabled }) => (disabled ? '0.2' : '1')};
`

const DefaultJoinButton = styled.button`
  ${joinButtonStyle}
`

// * This does not seem to work on iOS
const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.placeholder = ''
  e.target.select()
}

const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.placeholder = PLACEHOLDER
}

export const LockerRoom = ({
  gameCode,
  gameCodeChange,
  onJoinClick,
  logo,
  button: JoinButton = DefaultJoinButton,
}: {
  gameCode:       string;
  gameCodeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onJoinClick:    () => void;
  logo?:          ReactNode;
  button?:        ComponentType<React.ButtonHTMLAttributes<HTMLButtonElement>>;
}) => {
  const filled = gameCode.length === CODE_LENGTH

  const onKeyPress = (e: React.KeyboardEvent) => {
    if (filled && e.key === 'Enter') onJoinClick()
  }

  return (
    <IOSDisableDoubleTap>
      <ScrollLock />
      <FullHeight>
        {logo}
        <Columns style={{ height: '50dvh' }}>
          <Column>
            <GameCodeInput
              type="text"
              value={gameCode}
              onChange={gameCodeChange}
              placeholder={PLACEHOLDER}
              onFocus={onFocus}
              onBlur={onBlur}
              onKeyPress={onKeyPress}
              spellCheck="false"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
          </Column>
          <Column>
            <JoinButton disabled={!filled} onClick={onJoinClick}>
              Join
            </JoinButton>
          </Column>
        </Columns>
      </FullHeight>
    </IOSDisableDoubleTap>
  )
}
