
exports.newMachineLearningWebRTC = function newMachineLearningWebRTC() {
    /*
    This modules bring enables the communication between Test Clients and the Test Server.
    */
    let thisObject = {
        channelName: undefined,
        sendMessage: sendMessage,
        sendFile: sendFile,
        sendResponse: sendResponse,
        getNextMessage: getNextMessage,
        reset: reset,
        initialize: initialize,
        finalize: finalize
    }
    const ws = require('ws')
    const wrtc = require('wrtc')

    let peerConnection
    let datachannel
    let receivingFile
    let fileBuffer
    let receivingMultipleMessages
    let multipleMessagesArray
    let callbackFunction

    return thisObject

    function finalize() {
    }

    function sendMessage(message) {
        return new Promise(promiseWork)

        function promiseWork(resolve, reject) {
            let gotResponse = false
            if (datachannel !== undefined) {
                callbackFunction = onMenssageReceived
                setTimeout(onTimeout, 10000)
                datachannel.send(message)
                function onMenssageReceived(message) {
                    callbackFunction = undefined
                    gotResponse = true
                    resolve(message)
                }
                function onTimeout() {
                    if (gotResponse === false) {
                        reject('Test Server Disconnected.')
                        console.log((new Date()).toISOString(), 'WebRTC Message Timeout. Resetting Connection.')
                        thisObject.reset(true)
                    }
                }

            } else {
                reject('Test Server Not Available.')
                console.log((new Date()).toISOString(), 'WebRTC with no Data Channel. Resetting Connection.')
                thisObject.reset(true)
            }
        }
    }

    function sendResponse(message) {
        datachannel.send(message)
    }

    function sendFile(fileContent) {
        const MAX_LENGTH = 10000

        datachannel.send('SENDING FILE')
        let chunks = splitArrayIntoChunksOfLen(fileContent, MAX_LENGTH)
        for (let i = 0; i < chunks.length; i++) {
            let chunk = chunks[i]
            datachannel.send(chunk)
        }
        datachannel.send('FILE SENT')

        function splitArrayIntoChunksOfLen(arr, len) {
            var chunks = [], i = 0, n = arr.length;
            while (i < n) {
                chunks.push(arr.slice(i, i += len));
            }
            return chunks;
        }
    }

    function getNextMessage(serverCallbackFunction) {
        callbackFunction = serverCallbackFunction
    }

    function reset(tellRemoteParty) {
        /*
        When the connection is lost, a timeout happens, etc,
        this method will be executed.
        */
        if (tellRemoteParty === true && datachannel !== undefined) {
            datachannel.send('RESETTING')
            console.log((new Date()).toISOString(), 'WebRTC telling remote peer to Reset itself.')
        }
        console.log((new Date()).toISOString(), 'WebRTC resetting my own connection.')
        thisObject.initialize(thisObject.channelName)
    }


    function initialize(channelName) {

        const signalingChannel = new ws('ws://161.35.152.3:9456')
        let peerConnectionCfg = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }, { 'urls': 'stun:global.stun.twilio.com:3478?transport=udp' }], sdpSemantics: 'unified-plan' }
        
        thisObject.channelName = channelName

        peerConnection = undefined
        datachannel = undefined
        receivingFile = 'No'
        fileBuffer = undefined
        receivingMultipleMessages = 'No'
        multipleMessagesArray = []
        callbackFunction = undefined

        signalingChannel.channel = thisObject.channelName //channel like peer chat rooms

        signalingChannel.onmessage = (msg) => {
            let signal = JSON.parse(msg.data)

            if (signal.isChannelPresent == false) {
                //new/empty channel. Create and wait for new peers
                signalingChannel.push(JSON.stringify({
                    open: true,
                    channel: signalingChannel.channel
                }))
            } else if (signal.isChannelPresent == true) {
                //Channel available. Present yourself
                signalingChannel.push(JSON.stringify({
                    open: true,
                    channel: signalingChannel.channel
                }))
                setupOfferPeer() // create peer and make offer to others to connect
            }

            // We're getting an offer, so we answer to it
            if (signal.sdpOffer) {
                //console.log("[INFO] Got a SDP offer from remote peer")
                setupAnswerPeer(signal.sdpOffer) //configure remote peer and create an answer offer
            }
            else if (signal.sdpAnswer) {
                //console.log("[INFO] Got a SDP answer from remote peer")
                //Add remote peer configuration
                peerConnection.setRemoteDescription(new wrtc.RTCSessionDescription(signal.sdpAnswer))
            }
            else if (signal.candidate) {
                //console.log("[INFO] Received ICECandidate from remote peer.")
                //Add remote peer configuration options to try to connect
                peerConnection.addIceCandidate(new wrtc.RTCIceCandidate(signal.candidate))
            }
            else if (signal.closeConnection) {
                //console.log("[INFO] Received 'close' signal from remote peer.")
                peerConnection.close()
            }
        }

        // Open the signaling websocket connection and setup the messages with channel ID (network in SA)
        signalingChannel.onopen = () => {
            signalingChannel.push = signalingChannel.send
            signalingChannel.send = (data) => {
                signalingChannel.push(JSON.stringify({
                    data: data,
                    channel: signalingChannel.channel
                }))
            }
            //Check if channel is open/available
            signalingChannel.push(JSON.stringify({
                checkPresence: true,
                channel: signalingChannel.channel
            }))

        }

        // WebRTC Data Channel stuff     
        function setupOfferPeer() {
            //Create a new peer
            peerConnection = new wrtc.RTCPeerConnection(peerConnectionCfg)

            //Since we are initiating a connection, create the data channel
            datachannel = peerConnection.createDataChannel(thisObject.channelName)

            datachannel.onclose = onConnectionClosed
            datachannel.onmessage = onMenssage
            //console.log('[INFO] Channel Created by Initiator')

            peerConnection.onicecandidate = (msg) => {
                // send any ice candidates to the other peer, i.e., msg.candidate
                //console.log('[INFO] Sending ICE candidates')
                if (!msg || !msg.candidate) { return }
                signalingChannel.send({
                    candidate: msg.candidate
                })
            }
            //Here we create the configuration parameters to present to anyone who wants to connect to us
            //console.log('[INFO] creating offer')
            peerConnection.createOffer((offer) => {
                peerConnection.setLocalDescription(new wrtc.RTCSessionDescription(offer), () => {
                    // send the offer to a server to be forwarded to the other peer
                    signalingChannel.send({
                        sdpOffer: offer
                    })
                }, (error) => { console.log(error) })
            }, (error) => { console.log(error) })
        }

        function setupAnswerPeer(offer) {
            //Create a new peer
            peerConnection = new wrtc.RTCPeerConnection(peerConnectionCfg)

            peerConnection.onicecandidate = (msg) => {
                // send any ice candidates to the other peer, i.e., msg.candidate
                //console.log('[INFO] Sending ICE candidates')
                if (!msg || !msg.candidate) { return }
                signalingChannel.send({
                    candidate: msg.candidate
                })
            }
            //Since we have received an offer from a peer, we configure the new peer with that config...
            peerConnection.setRemoteDescription(new wrtc.RTCSessionDescription(offer))
            //console.log('[INFO] creating answer')
            //.. And send our configuration to the offering peer
            peerConnection.createAnswer((answer) => {
                peerConnection.setLocalDescription(new wrtc.RTCSessionDescription(answer), () => {
                    // send the offer to a server to be forwarded to the other peer
                    //console.log('[INFO] Sending Answer')
                    signalingChannel.send({
                        sdpAnswer: answer
                    })
                }, (error) => { console.log(error) })
            }, (error) => { console.log(error) })

            peerConnection.ondatachannel = evt => {
                //console.log('[INFO] Event Received: ' + JSON.stringify(evt))
                datachannel = evt.channel

                datachannel.onclose = onConnectionClosed
                datachannel.onmessage = onMenssage
                //console.log('[INFO] Channel Created by Listener')

                datachannel.onopen = () => {
                    //console.log('[INFO] The data connection is open. Start the magic')
                }
            }
        }

        /*
        This function is called when a message is received over a Data Channel.
        */
        function onMenssage(message) {
            if (callbackFunction === undefined) {
                console.log('[WARN] Unexpected Message Received, noone was waiting for it. ')
                console.log('[WARN] Message Received: ' + JSON.stringify(message))
            } else {

                switch (message.data) {
                    case 'RESETTING': {
                        console.log((new Date()).toISOString(), 'WebRTC remote peer told me to Reset myself. Resetting Connection.')
                        thisObject.reset(false)
                        break
                    }                    
                    case 'SENDING MULTIPLE MESSAGES': {
                        receivingMultipleMessages = 'Yes'
                        break
                    }
                    case 'MULTIPLE MESSAGES SENT': {
                        receivingMultipleMessages = 'No'
                        callbackFunction(multipleMessagesArray)
                        multipleMessagesArray = []
                        break
                    }
                    case 'SENDING FILE': {
                        receivingFile = 'Starting'
                        break
                    }
                    case 'FILE SENT': {
                        receivingFile = 'No'
                        multipleMessagesArray.push(fileBuffer)
                        fileBuffer = undefined
                        break
                    }
                    default: {
                        switch (receivingMultipleMessages) {
                            case 'No': {
                                //console.log('[INFO] Message Received: ' + JSON.stringify(message))
                                callbackFunction(message.data)
                                break
                            }
                            case 'Yes': {
                                switch (receivingFile) {
                                    case 'No': {
                                        multipleMessagesArray.push(message.data)
                                        break
                                    }
                                    case 'Starting': {
                                        fileBuffer = Buffer.from(message.data)
                                        receivingFile = 'Yes'
                                        break
                                    }
                                    case 'Yes': {
                                        let data = Buffer.from(message.data)
                                        fileBuffer = Buffer.concat([fileBuffer, data])
                                        break
                                    }
                                }
                                break
                            }
                        }
                    }
                }
            }
        }
        /*
        Data Channel being Closed.
        */
        function onConnectionClosed() {
            console.log((new Date()).toISOString(), 'WebRTC Connection Lost. Resetting Connection.')
            thisObject.reset(true)
        }
    }
}