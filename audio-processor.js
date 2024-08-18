class AudioProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        // Get the input audio data from the first channel        
		//~ this.port.postMessage(inputs[0][0]);
		
		// Mix stereo to mono
		const samples = new Float32Array(inputs[0][0].length).map((v, i) => (inputs[0][0][i] + inputs[0][1][i]) * 0.5);
		this.port.postMessage(samples, [samples.buffer]);
 
        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);
