import {
  WalletInterface,
  CreateActionArgs,
  SignActionArgs,
  AbortActionArgs,
  ListActionsArgs,
  InternalizeActionArgs,
  ListOutputsArgs,
  RelinquishOutputArgs,
  GetPublicKeyArgs,
  RevealCounterpartyKeyLinkageArgs,
  RevealSpecificKeyLinkageArgs,
  WalletEncryptArgs,
  WalletDecryptArgs,
  CreateHmacArgs,
  VerifyHmacArgs,
  CreateSignatureArgs,
  VerifySignatureArgs,
  AcquireCertificateArgs,
  ListCertificatesArgs,
  ProveCertificateArgs,
  RelinquishCertificateArgs,
  DiscoverByIdentityKeyArgs,
  DiscoverByAttributesArgs,
  GetHeaderArgs,
  WERR_REVIEW_ACTIONS
} from '@bsv/sdk';
import { listen, emit } from '@tauri-apps/api/event'


// Parse the origin header and turn it into a fqdn (e.g. projectbabbage.com:8080)
// Handles both origin and legacy originator headers
function parseOrigin(req, headers: Record<string, string>): string {
  const rawOrigin = headers['origin'];
  const rawOriginator = headers['originator'];

  // 1) Browser case
  if (rawOrigin) {
    return new URL(rawOrigin).host;
  }

  // 2) Node-injected fallback
  if (rawOriginator) {
    // Add scheme only if missing
    const candidate = rawOriginator.includes('://')
      ? rawOriginator
      : `http://${rawOriginator}`;
    return new URL(candidate).host;
  }

  emit('ts-response', {
    request_id: req.request_id,
    status: 400,
    body: JSON.stringify({ message: 'Origin header is required' })
  })
  return
}


export const onWalletReady = async (wallet: WalletInterface): Promise<(() => void) | undefined> => {
  const unlisten = await listen('http-request', async (event) => {
  //return await listen('http-request', async (event) => {
    let response

    try {
      const req = JSON.parse(event.payload as string)
      req.headers = (req.headers as string[][]).map(([k, v]) => {
        return [
          k.toLowerCase(),
          v
        ]
      })
      req.headers = Object.fromEntries(req.headers)
      const origin = parseOrigin(req, req.headers)

      switch (req.path) {
        // 1. createAction
        case '/createAction': {
          try {
            const args = JSON.parse(req.body) as CreateActionArgs;

            const result = await wallet.createAction(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            if (typeof error === 'object' && error.constructor.name === 'WERR_REVIEW_ACTIONS') {
              const e = new WERR_REVIEW_ACTIONS(
                error['reviewActionResults'],
                error['sendWithResults'],
                error['txid'],
                error['tx'],
                error['noSendChange'],
              )
              console.error('createAction WERR_REVIEW_ACTIONS:', e)
              response = {
                request_id: req.request_id,
                status: 400,
                body: JSON.stringify(e)
              }
            } else {
              console.error('createAction error:', error)
              response = {
                request_id: req.request_id,
                status: 400,
                body: JSON.stringify({
                  message: error instanceof Error ? error.message : String(error)
                })
              }
            }
          }
          break
        }

        // 2. signAction
        case '/signAction': {
          try {
            const args = JSON.parse(req.body) as SignActionArgs

            const result = await wallet.signAction(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            if (typeof error === 'object' && error.constructor.name === 'WERR_REVIEW_ACTIONS') {
              const e = new WERR_REVIEW_ACTIONS(
                error['reviewActionResults'],
                error['sendWithResults'],
                error['txid'],
                error['tx'],
              )
              console.error('signAction WERR_REVIEW_ACTIONS:', e)
              response = {
                request_id: req.request_id,
                status: 400,
                body: JSON.stringify(e)
              }
            } else {
              console.error('signAction error:', error)
              response = {
                request_id: req.request_id,
                status: 400,
                body: JSON.stringify({
                  message: error instanceof Error ? error.message : String(error)
                })
              }
            }
          }
          break
        }

        // 3. abortAction
        case '/abortAction': {
          try {
            const args = JSON.parse(req.body) as AbortActionArgs

            const result = await wallet.abortAction(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('abortAction error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 4. listActions
        case '/listActions': {
          try {
            const args = JSON.parse(req.body) as ListActionsArgs

            const result = await wallet.listActions(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('listActions error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 5. internalizeAction
        case '/internalizeAction': {
          try {
            const args = JSON.parse(req.body) as InternalizeActionArgs

            const result = await wallet.internalizeAction(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            if (typeof error === 'object' && error.constructor.name === 'WERR_REVIEW_ACTIONS') {
              const e = new WERR_REVIEW_ACTIONS(
                error['reviewActionResults'],
                error['sendWithResults'],
                error['txid'],
                error['tx'],
              )
              console.error('internalizeAction WERR_REVIEW_ACTIONS:', e)
              response = {
                request_id: req.request_id,
                status: 400,
                body: JSON.stringify(e)
              }
            } else {
              console.error('internalizeAction error:', error)
              response = {
                request_id: req.request_id,
                status: 400,
                body: JSON.stringify({
                  message: error instanceof Error ? error.message : String(error)
                }),
              }
            }
          }
          break
        }

        // 6. listOutputs
        case '/listOutputs': {
          try {
            const args = JSON.parse(req.body) as ListOutputsArgs

            const result = await wallet.listOutputs(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('listOutputs error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 7. relinquishOutput
        case '/relinquishOutput': {
          try {
            const args = JSON.parse(req.body) as RelinquishOutputArgs

            const result = await wallet.relinquishOutput(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('relinquishOutput error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 8. getPublicKey
        case '/getPublicKey': {
          try {
            const args = JSON.parse(req.body) as GetPublicKeyArgs

            const result = await wallet.getPublicKey(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('getPublicKey error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 9. revealCounterpartyKeyLinkage
        case '/revealCounterpartyKeyLinkage': {
          try {
            const args = JSON.parse(req.body) as RevealCounterpartyKeyLinkageArgs

            const result = await wallet.revealCounterpartyKeyLinkage(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('revealCounterpartyKeyLinkage error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 10. revealSpecificKeyLinkage
        case '/revealSpecificKeyLinkage': {
          try {
            const args = JSON.parse(req.body) as RevealSpecificKeyLinkageArgs

            const result = await wallet.revealSpecificKeyLinkage(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('revealSpecificKeyLinkage error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 11. encrypt
        case '/encrypt': {
          try {
            const args = JSON.parse(req.body) as WalletEncryptArgs

            const result = await wallet.encrypt(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('encrypt error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 12. decrypt
        case '/decrypt': {
          try {
            const args = JSON.parse(req.body) as WalletDecryptArgs

            const result = await wallet.decrypt(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('decrypt error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 13. createHmac
        case '/createHmac': {
          try {
            const args = JSON.parse(req.body) as CreateHmacArgs

            const result = await wallet.createHmac(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('createHmac error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 14. verifyHmac
        case '/verifyHmac': {
          try {
            const args = JSON.parse(req.body) as VerifyHmacArgs

            const result = await wallet.verifyHmac(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('verifyHmac error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 15. createSignature
        case '/createSignature': {
          try {
            const args = JSON.parse(req.body) as CreateSignatureArgs

            const result = await wallet.createSignature(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('createSignature error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 16. verifySignature
        case '/verifySignature': {
          try {
            const args = JSON.parse(req.body) as VerifySignatureArgs

            const result = await wallet.verifySignature(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('verifySignature error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 17. acquireCertificate
        case '/acquireCertificate': {
          try {
            const args = JSON.parse(req.body) as AcquireCertificateArgs

            const result = await wallet.acquireCertificate(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('acquireCertificate error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 18. listCertificates
        case '/listCertificates': {
          try {
            const args = JSON.parse(req.body) as ListCertificatesArgs

            const result = await wallet.listCertificates(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('listCertificates error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 19. proveCertificate
        case '/proveCertificate': {
          try {
            const args = JSON.parse(req.body) as ProveCertificateArgs

            const result = await wallet.proveCertificate(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('proveCertificate error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 20. relinquishCertificate
        case '/relinquishCertificate': {
          try {
            const args = JSON.parse(req.body) as RelinquishCertificateArgs

            const result = await wallet.relinquishCertificate(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('relinquishCertificate error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 21. discoverByIdentityKey
        case '/discoverByIdentityKey': {
          try {
            const args = JSON.parse(req.body) as DiscoverByIdentityKeyArgs

            const result = await wallet.discoverByIdentityKey(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('discoverByIdentityKey error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 22. discoverByAttributes
        case '/discoverByAttributes': {
          try {
            const args = JSON.parse(req.body) as DiscoverByAttributesArgs

            const result = await wallet.discoverByAttributes(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('discoverByAttributes error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 23. isAuthenticated
        case '/isAuthenticated': {
          try {
            const result = await wallet.isAuthenticated({}, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('isAuthenticated error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 24. waitForAuthentication
        case '/waitForAuthentication': {
          try {
            const result = await wallet.waitForAuthentication({}, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('waitForAuthentication error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 25. getHeight
        case '/getHeight': {
          try {
            const result = await wallet.getHeight({}, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('getHeight error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 26. getHeaderForHeight
        case '/getHeaderForHeight': {
          try {
            const args = JSON.parse(req.body) as GetHeaderArgs

            const result = await wallet.getHeaderForHeight(args, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('getHeaderForHeight error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 27. getNetwork
        case '/getNetwork': {
          try {
            const result = await wallet.getNetwork({}, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('getNetwork error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        // 28. getVersion
        case '/getVersion': {
          try {
            const result = await wallet.getVersion({}, origin)
            response = {
              request_id: req.request_id,
              status: 200,
              body: JSON.stringify(result),
            }
          } catch (error) {
            console.error('getVersion error:', error)
            response = {
              request_id: req.request_id,
              status: 400,
              body: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              }),
            }
          }
          break
        }

        default: {
          response = {
            request_id: req.request_id,
            status: 404,
            body: JSON.stringify({ error: 'Unknown wallet path: ' + req.path }),
          }
          break
        }
      }

      // Emit the response back to Rust.
      emit('ts-response', response)
    } catch (e) {
      console.error("Error handling http-request event:", e)
    }
  })
// ---- Announce bridge readiness immediately and with a couple of retries ----
;(window as any).__mndBridgeReady = true

const fire = () => {
  if ((window as any).__mndBridgeAnnounced) return
  try { (window as any).__mndAnnouncePresence?.() } catch {}
  try { window.dispatchEvent(new CustomEvent('mnd:bridge-ready')) } catch {}
  try { window.postMessage({ type: 'mnd:bridge-ready' }, '*') } catch {}
}

// fire now + micro/macro tasks; mark announced after next frame
fire()                                     // sync
setTimeout(fire, 0)                        // macrotask
Promise.resolve().then(fire).catch(() => {}) // microtask
requestAnimationFrame(() => {
  fire()
  ;(window as any).__mndBridgeAnnounced = true
})
setTimeout(() => { fire() }, 200)          // short retry before rAF in some cases
setTimeout(() => { fire() }, 800)          // last retry if UI was late

return unlisten
}