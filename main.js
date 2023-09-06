import { initializeApp } from "firebase/app";
import {
	getFirestore,
	collection,
	doc,
	addDoc,
	setDoc,
	getDoc,
	onSnapshot,
} from "firebase/firestore";

// import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
	apiKey: "AIzaSyAMvjRp6j1Urh1OLUUgZl0qyomqEPal88E",
	authDomain: "my-awesome-project-b02a5.firebaseapp.com",
	projectId: "my-awesome-project-b02a5",
	storageBucket: "my-awesome-project-b02a5.appspot.com",
	messagingSenderId: "527225020365",
	appId: "1:527225020365:web:2c2d60b5f34936cc6d2e84",
	measurementId: "G-6DB6MYGDCV",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

const servers = {
	iceServers: [
		{
			urls: "stun:stun.relay.metered.ca:80",
		},
		{
			urls: "turn:a.relay.metered.ca:80",
			username: "7b416dcd7cd947255bb3e582",
			credential: "XGzw9cFhLcU7ebvI",
		},
		{
			urls: "turn:a.relay.metered.ca:80?transport=tcp",
			username: "7b416dcd7cd947255bb3e582",
			credential: "XGzw9cFhLcU7ebvI",
		},
		{
			urls: "turn:a.relay.metered.ca:443",
			username: "7b416dcd7cd947255bb3e582",
			credential: "XGzw9cFhLcU7ebvI",
		},
		{
			urls: "turn:a.relay.metered.ca:443?transport=tcp",
			username: "7b416dcd7cd947255bb3e582",
			credential: "XGzw9cFhLcU7ebvI",
		},
	],
	iceCandidatePoolSize: 10,
};

let pc = new RTCPeerConnection(servers);

let localStream = null;
let remoteStream = null;

const webcamButton = document.querySelector("#webcamButton");
const webCamVideo = document.querySelector("#webcamVideo");
const callButton = document.querySelector("#callButton");
const callInput = document.querySelector("#callInput");
const answerButton = document.querySelector("#answerButton");
const hangupButton = document.querySelector("#hangupButton");
const remoteVideo = document.querySelector("#remoteVideo");
const tipCont = document.querySelector(".tip");
const tipMessage = tipCont.querySelector(".message");

console.log(tipCont, tipMessage);

const state = {
	online: true,
	error: "",
};

const openWebcam = async function () {
	try {
		localStream = await navigator.mediaDevices.getUserMedia({
			video: 1,
			audio: 1,
		});
		remoteStream = new MediaStream();
		localStream.getTracks().forEach((track) => {
			pc.addTrack(track, localStream);
		});

		pc.addEventListener("ontrack", (e) => {
			e.streams[0].getTracks().forEach((track) => {
				remoteStream.addTrack(track);
			});
		});

		webCamVideo.srcObject = localStream;
		remoteVideo.srcObject = remoteStream;
	} catch (err) {
		throw err;
	}
};

const timeout = function (s) {
	return new Promise(function (_, reject) {
		setTimeout(function () {
			reject(
				new Error(
					`Request took too long! Timeout after ${s} second${
						s === 1 ? "" : "s"
					}`
				)
			);
		}, s * 1000);
	});
};

const createCall = async function () {
	try {
		await openWebcam();
		const callsCollection = collection(firestore, "calls");
		const callDoc = doc(callsCollection);

		const callDocRef = doc(callsCollection, callDoc.id);
		const offerCandidates = collection(callDocRef, "offerCandidates");
		const answerCandidates = collection(callDocRef, "answerCandidates");

		if (!state.online) throwError("Error: Check Your Internet Connection 💥💥");
		const link = window.location.href.split("#")[0];

		copyTextToClipboard(`${link}#${callDocRef.id}`);

		// Add icecandidate event listener
		pc.addEventListener("icecandidate", async (event) => {
			if (event.candidate) {
				// Handling the ice candidate
				await addDoc(offerCandidates, event.candidate.toJSON());
			}
		});

		if (!state.online)
			throw new Error("You're not connected to the internet. 💥💥");
		const offerDescription = await Promise.race([
			pc.createOffer(),
			timeout(10),
		]);
		await pc.setLocalDescription(offerDescription);

		const offer = {
			sdp: offerDescription.sdp,
			type: offerDescription.type,
		};

		// Store the offer in Firestore
		await Promise.race([setDoc(callDocRef, { offer }), timeout(10)]); // Use setDoc to store the offer as an object

		// Listen for changes in Firestore document
		onSnapshot(callDocRef, (snapshot) => {
			// Listen to callDocRef instead of callsCollection
			const data = snapshot.data();
			console.log(data);

			if (!pc.currentRemoteDescription && data?.answer) {
				const answerDescription = new RTCSessionDescription(data.answer);
				pc.setRemoteDescription(answerDescription);
			}

			// Handle answerCandidates as you were doing
			onSnapshot(answerCandidates, (snapshot) => {
				snapshot.docChanges().forEach((change) => {
					if (change.type === "added") {
						const candidate = new RTCIceCandidate(change.doc.data());
						pc.addIceCandidate(candidate);
					}
				});
			});
		});
	} catch (err) {
		showMessage(err.message);
	}
};

const answerCall = async function (number = 12320) {
	try {
		await openWebcam();

		const callId = window.location.href.split("#")[1] || number;
		console.log(window.location.href.split("#")[1]);
		console.log(number);
		console.log(callId);

		// Create references to the Firestore collection and document
		const callsCollection = collection(firestore, "calls");
		const callDocRef = doc(callsCollection, callId); // Use the provided callId as the document ID

		// Create a reference to the "answerCandidates" subcollection
		const answerCandidates = collection(callDocRef, "answerCandidates");

		if (!state.online) throwError("You're not connected to the internet.");
		pc.addEventListener("icecandidate", async function (e) {
			if (e.candidate) {
				try {
					// Add the ICE candidate to Firestore's answerCandidates collection
					await addDoc(answerCandidates, e.candidate.toJSON());
				} catch (error) {
					throwError("Error connecting you with caller");
				}
			}
		});

		const callDataSnapshot = await getDoc(callDocRef);
		if (callDataSnapshot.exists()) {
			const callData = callDataSnapshot.data();

			const offerDescription = new RTCSessionDescription(callData.offer);
			await pc.setRemoteDescription(offerDescription);

			const answerDescription = await pc.createAnswer();
			await pc.setLocalDescription(answerDescription);

			const answer = {
				type: answerDescription.type,
				sdp: answerDescription.sdp,
			};

			// Use setDoc to update the document with the answer field
			await setDoc(callDocRef, { answer }, { merge: true });

			// Listen for changes in the "offerCandidates" subcollection
			onSnapshot(collection(callDocRef, "offerCandidates"), (snapshot) => {
				snapshot.docChanges().forEach((change) => {
					if (change.type === "added") {
						let data = change.doc.data();
						pc.addIceCandidate(new RTCIceCandidate(data));
					}
				});
			});
		} else {
			throw new Error("Call does not exist:", callId);
		}
	} catch (error) {
		// Handling error
		showMessage(err.message);
	}
};

pc.ontrack = (event) => {
	if (event.streams && event.streams[0]) {
		remoteVideo.srcObject = event.streams[0];
	}
};

// Helper Function
const checkInternetConnection = function () {
	if (navigator.onLine) {
		state.online = true;
	} else {
		state.online = false;
	}
};

const throwError = function (errMessage) {
	throw new Error(errMessage);
};

const copyTextToClipboard = function (text) {
	if (navigator.clipboard) {
		navigator.clipboard
			.writeText(text)
			.then(() => {
				// Clipboard write succeeded
				showNotification(
					"Call Link Copied",
					`The call link has been copied to the clipboard. Send it to the person you want to speak to.`,
					text
				);
			})
			.catch((error) => {
				// Clipboard write failed, handle the error
				console.error("Clipboard write failed:", error);
				showMessage(`Your call link ${text}`);
			});
	} else {
		// Fallback method for browsers that don't support Clipboard API
		const textarea = document.createElement("textarea");
		textarea.value = text;
		document.body.appendChild(textarea);
		textarea.select();
		document.execCommand("copy");
		document.body.removeChild(textarea);
		showNotification(
			"Call Link Copied",
			`The call link has been copied to the clipboard. Send it to the person you want to speak to`,
			text
		);

		showMessage(`${text}`);
	}
};

const showMessage = function (message) {
	tipMessage.textContent = message;
	tipCont.classList.add("show");
	setTimeout(() => {
		tipCont.classList.remove("show");
	}, 10000);
};

const showNotification = function (title, message, code) {
	if ("Notification" in window) {
		Notification.requestPermission().then(function (permission) {
			if (permission === "granted") {
				new Notification(title, {
					body: message,
				});
			} else {
				showMessage(`Call link copied to clipboard. (${code})`);
			}
		});
	} else {
		showMessage(`Call link copied to clipboard. ${code}`);
	}
};

const changeCallHref = function () {
	if (performance.navigation.type === 1) {
		// Change the URL to a new location

		window.location.href = "/";
	}
};

const hangup = function () {
	// Stop local video and audio streams
	localStream = null;

	remoteStream = null;
	webCamVideo.srcObject = null;
	remoteVideo.srcObject = null;

	// Close the RTCPeerConnection (WebRTC)
	pc.close();
	pc = new RTCPeerConnection(servers);

	// Inform the other participant(s) and perform cleanup
	// Update UI to show call has ended
};

// Check internet connection when the page loads
checkInternetConnection();

window.addEventListener("online", checkInternetConnection);
window.addEventListener("offline", checkInternetConnection);
answerButton.addEventListener("click", function () {
	const number = callInput.value.split("#")[1];
	answerCall(number);
});
window.addEventListener("load", function () {
	if (this.window.location.href.split("#")[1]?.length > 2) {
		answerCall();
	}
});
// webcamButton.addEventListener("click", openWebcam);
callButton.addEventListener("click", createCall);
hangupButton.addEventListener("click", hangup);
changeCallHref();
