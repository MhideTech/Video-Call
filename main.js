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
			urls: ["stun:stun1.1.google.com:19302", "stun:stun2.1.google.com:19302"],
		},
		{
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
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

webcamButton.addEventListener("click", async function () {
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
});

callButton.addEventListener("click", async function () {
	const callsCollection = collection(firestore, "calls");
	const callDoc = doc(callsCollection);

	// ...

	const callDocRef = doc(callsCollection, callDoc.id);
	const offerCandidates = collection(callDocRef, "offerCandidates");
	const answerCandidates = collection(callDocRef, "answerCandidates");

	callInput.value = callDocRef.id;

	// Add icecandidate event listener
	pc.addEventListener("icecandidate", async (event) => {
		console.log(event.candidate);
		if (event.candidate) {
			// Handling the ice candidate
			await addDoc(offerCandidates, event.candidate.toJSON());
		}
	});

	const offerDescription = await pc.createOffer();
	await pc.setLocalDescription(offerDescription);

	const offer = {
		sdp: offerDescription.sdp,
		type: offerDescription.type,
	};

	// Store the offer in Firestore
	await setDoc(callDocRef, { offer }); // Use setDoc to store the offer as an object

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
});

answerButton.addEventListener("click", async function () {
	const callId = callInput.value; // Get the call ID from your input field

	// Create references to the Firestore collection and document
	const callsCollection = collection(firestore, "calls");
	const callDocRef = doc(callsCollection, callId); // Use the provided callId as the document ID

	// Create a reference to the "answerCandidates" subcollection
	const answerCandidates = collection(callDocRef, "answerCandidates");

	pc.addEventListener("icecandidate", async function (e) {
		if (e.candidate) {
			try {
				// Add the ICE candidate to Firestore's answerCandidates collection
				await addDoc(answerCandidates, e.candidate.toJSON());
			} catch (error) {
				console.error("Error adding ICE candidate to Firestore:", error);
			}
		}
	});

	try {
		const callDataSnapshot = await getDoc(callDocRef);
		if (callDataSnapshot.exists()) {
			const callData = callDataSnapshot.data();
			console.log(callData);

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
			console.error("Document does not exist:", callId);
		}
	} catch (error) {
		console.error("Error fetching document:", error);
	}
});

// Set pc.ontrack event handler outside the answerButton event listener
pc.ontrack = (event) => {
	console.log("Received remote tracks:", event.streams);
	if (event.streams && event.streams[0]) {
		remoteVideo.srcObject = event.streams[0];
		console.log(remoteVideo);
	}
	console.log("Hello");
};
