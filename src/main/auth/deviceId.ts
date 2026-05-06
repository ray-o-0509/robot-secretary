import * as crypto from 'node:crypto'
import keytar from 'keytar'

const KEYCHAIN_SERVICE = 'robot-secretary'
const KEYCHAIN_DEVICE_ID = 'device-id'

export async function getDeviceId(): Promise<string> {
  let id = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_DEVICE_ID)
  if (!id) {
    id = crypto.randomUUID()
    await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_DEVICE_ID, id)
  }
  return id
}
