
exports.newMachineLearningWebRTC = function newMachineLearningWebRTC() {
    /*
    This modules bring enables the communication between Test Clients and the Test Server.
    */
    let thisObject = {
        runningAtTestServer: undefined,
        status: undefined,
        userProfile: undefined,
        channelName: undefined,
        clientInstanceName: undefined,
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

    const signalingChannel = new ws('ws://161.35.152.3:9456')
    let peerConnectionCfg = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }, { 'urls': 'stun:global.stun.twilio.com:3478?transport=udp' }], sdpSemantics: 'unified-plan' }

    let peerConnection
    let datachannel
    let receivingFile
    let fileBuffer
    let receivingMultipleMessages
    let multipleMessagesArray
    let callbackFunction
    let pingIntervalId
    let lastPingReceived

    return thisObject

    function finalize() {
    }

    function startPinging() {
        if (pingIntervalId !== undefined) {
            clearInterval(pingIntervalId)
        }
        console.log((new Date()).toISOString(), 'WebRTC Start PINGING')
        pingIntervalId = setInterval(sendPing, 5 * 1000)

        function sendPing() {
            let timestamp = (new Date()).valueOf()
            if (lastPingReceived === undefined) { lastPingReceived = timestamp }
            if (timestamp - lastPingReceived > 60 * 1000) {
                thisObject.status = "Disconnected from Test Server"
                console.log((new Date()).toISOString(), 'WebRTC has disconnected from Test Server.')
                clearInterval(pingIntervalId)
                pingIntervalId = undefined
                lastPingReceived = undefined
                return
            }

            if (datachannel !== undefined) {
                datachannel.send('PING')
                console.log((new Date()).toISOString(), 'WebRTC PING')
            } else {
                console.log((new Date()).toISOString(), 'WebRTC Pinging Stopped because Data Channel is undefined.')
                clearInterval(pingIntervalId)
                pingIntervalId = undefined
                lastPingReceived = undefined
            }
        }
    }

    function sendMessage(message) {
        return new Promise(promiseWork)

        function promiseWork(resolve, reject) {
            if (thisObject.status !== "Connected to Test Server") {
                console.log((new Date()).toISOString(), 'WebRTC is not connected to the Test Server.')
                reject('Not Connected to Test Server')
                return
            }

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
                        reject('Test Server Timeout.')
                        console.log((new Date()).toISOString(), 'WebRTC Message Timeout.')
                    }
                }

            } else {
                reject('Test Server Not Available.')
                console.log((new Date()).toISOString(), 'WebRTC with no Data Channel. Resetting Connection.')
                thisObject.reset()
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

    function reset() {
        /*
        When the connection is lost, a timeout happens, etc,
        this method will be executed.
        */
        console.log((new Date()).toISOString(), 'WebRTC Resetting the connection.')
        thisObject.initialize(thisObject.channelName)
    }

    function initialize(channelName) {

        thisObject.channelName = channelName

        peerConnection = undefined
        datachannel = undefined
        receivingFile = 'No'
        fileBuffer = undefined
        receivingMultipleMessages = 'No'
        multipleMessagesArray = []
        callbackFunction = undefined

        signalingChannel.channel = thisObject.channelName //channel like peer chat rooms
        signalingChannel.onmessage = onSignalingChannelMessage
        signalingChannel.onopen = onSignalingChannelOpen

        function onSignalingChannelMessage(msg) {
            try {
                if (
                    thisObject.status === "Connected to Test Server" ||
                    thisObject.status === "Connected to Client Instance"
                ) {
                    /*
                    Once we reach this state, we need to ignore further messages, since 2 instances connecting to the server simultaniously would crash it.
                    */
                    console.log((new Date()).toISOString(), 'WebRTC CAUTIONNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.')

                    //return
                }
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
                    // console.log('Debug Log', "[INFO] Got a SDP offer from remote peer")
                    setupAnswerPeer(signal.sdpOffer) //configure remote peer and create an answer offer
                }
                else if (signal.sdpAnswer) {
                    // console.log('Debug Log', "[INFO] Got a SDP answer from remote peer")
                    //Add remote peer configuration
                    peerConnection.setRemoteDescription(new wrtc.RTCSessionDescription(signal.sdpAnswer))
                    switch (thisObject.runningAtTestServer) {
                        case false: {
                            console.log((new Date()).toISOString(), 'WebRTC Client Succesfully Connected to the Test Server.')
                            thisObject.status = "Connected to Test Server"
                            startPinging()
                            break
                        }
                        case true: {
                            console.log((new Date()).toISOString(), 'WebRTC Server Succesfully Connected to ' + thisObject.userProfile + ' / ' + thisObject.clientInstanceName + ' .')
                            thisObject.status = "Connected to Client Instance"
                            startPinging()
                            break
                        }
                    }
                }
                else if (signal.candidate) {
                    // console.log('Debug Log', "[INFO] Received ICECandidate from remote peer.")
                    //Add remote peer configuration options to try to connect
                    peerConnection.addIceCandidate(new wrtc.RTCIceCandidate(signal.candidate))
                }
                else if (signal.closeConnection) {
                    // console.log('Debug Log', "[INFO] Received 'close' signal from remote peer.")
                    peerConnection.close()
                }
            } catch (err) {
                console.log((new Date()).toISOString(), 'WebRTC reconvering from connection related error @ onSignalingChannelMessage.')
                console.log((new Date()).toISOString(), err.stack)
                thisObject.reset()
            }
        }

        function onSignalingChannelOpen() {
            /*
            Open the signaling websocket connection and setup the messages with channel ID  
            */
            try {
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
            } catch (err) {
                console.log((new Date()).toISOString(), 'WebRTC reconvering from connection related error @ onSignalingChannelMessage.')
                console.log((new Date()).toISOString(), err.stack)
                thisObject.reset()
            }
        }

        function setupOfferPeer() {
            try {
                /*
                WebRTC Data Channel stuff
                */
                //Create a new peer
                peerConnection = new wrtc.RTCPeerConnection(peerConnectionCfg)

                //Since we are initiating a connection, create the data channel
                datachannel = peerConnection.createDataChannel(thisObject.channelName)

                datachannel.onclose = onConnectionClosed
                datachannel.onmessage = onMenssage
                // console.log('Debug Log', (new Date()).toISOString(), '[INFO] Channel Created by Initiator')

                peerConnection.onicecandidate = (msg) => {
                    // send any ice candidates to the other peer, i.e., msg.candidate
                    // console.log('Debug Log', (new Date()).toISOString(), '[INFO] Sending ICE candidates')
                    if (!msg || !msg.candidate) { return }
                    signalingChannel.send({
                        candidate: msg.candidate
                    })
                }
                //Here we create the configuration parameters to present to anyone who wants to connect to us
                // console.log('Debug Log', (new Date()).toISOString(), '[INFO] creating offer')
                peerConnection.createOffer((offer) => {
                    peerConnection.setLocalDescription(new wrtc.RTCSessionDescription(offer), () => {
                        // send the offer to a server to be forwarded to the other peer
                        signalingChannel.send({
                            sdpOffer: offer
                        })
                    }, (error) => { console.log(error) })
                }, (error) => { console.log(error) })
            } catch (err) {
                console.log((new Date()).toISOString(), 'WebRTC reconvering from connection related error @ setupOfferPeer.')
                console.log((new Date()).toISOString(), err.stack)
                thisObject.reset()
            }
        }

        function setupAnswerPeer(offer) {
            try {
                //Create a new peer
                peerConnection = new wrtc.RTCPeerConnection(peerConnectionCfg)

                peerConnection.onicecandidate = (msg) => {
                    // send any ice candidates to the other peer, i.e., msg.candidate
                    // console.log('Debug Log', (new Date()).toISOString(), '[INFO] Sending ICE candidates')
                    if (!msg || !msg.candidate) { return }
                    signalingChannel.send({
                        candidate: msg.candidate
                    })
                }
                //Since we have received an offer from a peer, we configure the new peer with that config...
                peerConnection.setRemoteDescription(new wrtc.RTCSessionDescription(offer))
                // console.log('Debug Log', (new Date()).toISOString(), '[INFO] creating answer')
                //.. And send our configuration to the offering peer
                peerConnection.createAnswer((answer) => {
                    peerConnection.setLocalDescription(new wrtc.RTCSessionDescription(answer), () => {
                        // send the offer to a server to be forwarded to the other peer
                        // console.log('Debug Log', (new Date()).toISOString(), '[INFO] Sending Answer')
                        signalingChannel.send({
                            sdpAnswer: answer
                        })
                    }, (error) => { console.log(error) })
                }, (error) => { console.log(error) })

                peerConnection.ondatachannel = evt => {
                    // console.log('Debug Log', (new Date()).toISOString(), '[INFO] Event Received: ' + JSON.stringify(evt))
                    datachannel = evt.channel

                    datachannel.onclose = onConnectionClosed
                    datachannel.onmessage = onMenssage
                    // console.log('Debug Log', (new Date()).toISOString(), '[INFO] Channel Created by Listener')

                    datachannel.onopen = () => {
                        switch (thisObject.runningAtTestServer) {
                            case false: {
                                console.log((new Date()).toISOString(), 'WebRTC Client Succesfully Connected to the Test Server.')
                                thisObject.status = "Connected to Test Server"
                                startPinging()
                                break
                            }
                            case true: {
                                console.log((new Date()).toISOString(), 'WebRTC Server Succesfully Connected to ' + thisObject.userProfile + ' / ' + thisObject.clientInstanceName + ' .')
                                thisObject.status = "Connected to Client Instance"
                                startPinging()
                                break
                            }
                        }
                    }
                }
            } catch (err) {
                console.log((new Date()).toISOString(), 'WebRTC reconvering from connection related error @ setupAnswerPeer.')
                console.log((new Date()).toISOString(), err.stack)
                thisObject.reset()
            }
        }

        function onMenssage(message) {
            try {
                /*
                This function is called when a message is received over a Data Channel.
                */
                if (message.data === 'PING') {
                    lastPingReceived = (new Date()).valueOf()
                    console.log((new Date()).toISOString(), 'WebRTC PING RECEIVED.')
                    return
                }

                if (callbackFunction === undefined) {
                    console.log((new Date()).toISOString(), '[WARN] Unexpected Message Received, noone was waiting for it. ')
                    console.log((new Date()).toISOString(), '[WARN] Message Received: ' + JSON.stringify(message))
                } else {

                    switch (message.data) {
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
                                    // console.log('Debug Log', (new Date()).toISOString(), '[INFO] Message Received: ' + JSON.stringify(message))
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
            } catch (err) {
                console.log((new Date()).toISOString(), 'WebRTC reconvering from connection related error @ onMenssage.')
                console.log((new Date()).toISOString(), err.stack)
                thisObject.reset()
            }
        }

        function onConnectionClosed() {
            /*
            Data Channel being Closed.
            */
            console.log((new Date()).toISOString(), 'WebRTC Connection Lost. Resetting Connection.')
            thisObject.reset()
        }
    }
}