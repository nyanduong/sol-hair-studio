import { io } from 'socket.io-client'

export function watchAvailability(baseUrl, token, refresh, connectionChanged) {
  const socket = io(baseUrl, { auth: { token }, autoConnect: false, forceNew: true })
  let timer
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(refresh, 150)
  }
  const offline = () => connectionChanged(false)
  socket.on('connect', () => {
    connectionChanged(true)
    schedule()
  })
  socket.on('disconnect', offline)
  socket.on('connect_error', offline)
  socket.on('availability:changed', schedule)
  socket.connect()
  return () => {
    clearTimeout(timer)
    socket.removeAllListeners()
    socket.disconnect()
  }
}
