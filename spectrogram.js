const recordButton = document.getElementById('record-button');
const clearButton = document.getElementById('clear-button');
const labelsButton = document.getElementById('labels-button');
const fullscreenButton = document.getElementById('fullscreen-button');
const screenCanvas = document.getElementById("myCanvas");

// RECORD BUTTON

var audioContext, microphoneNode, processorNode;
var recording = false;

recordButton.addEventListener('click', async () => {
    recording = !recording;
    recordButton.classList.toggle('active');
    
    if(!recording) {
        processorNode.disconnect();
        microphoneNode.disconnect();
        audioContext.close();
        return;
    }
    
    // Check if the browser supports the required APIs
    if(!window.AudioContext || !window.MediaStreamAudioSourceNode || !window.AudioWorkletNode) {
        alert('Your browser does not support the required APIs');
        return;
    }

    // Request access to the user's microphone
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    // Create the microphone stream
    audioContext = new AudioContext({sampleRate: 44100});
    microphoneNode = audioContext.createMediaStreamSource(micStream);

    // Create and connect AudioWorkletNode for processing the audio stream
    await audioContext.audioWorklet.addModule("audio-processor.js");
    processorNode = new AudioWorkletNode(audioContext, 'audio-processor');
    processorNode.port.onmessage = (event) => {
        processSamples(event.data);
    };
    
    microphoneNode.connect(processorNode);
});

// PROCESS AUDIO

const sampleRate = 44100;

const fftSize = 2048;
const fft = new FFTJS(fftSize);
const fftInput = new Float32Array(fftSize);
const fftOutput = fft.createComplexArray();
const windowInc = fftSize / 4;

const amplifyFactor = 10.0;

const timeResolution = windowInc / sampleRate;
const freqResolution = sampleRate / fftSize;

const timeMaximum = 7.5;
const freqMaximum = 6500.0;

const timePixels = timeMaximum / timeResolution;
const freqPixels = freqMaximum / freqResolution;

const fftWindow = initFFTWindow();

var block = new Float32Array(fftSize);
block.fill(0.0);
var blockPosition = 0;

var spectrum = new Float32Array(fftSize / 2);
spectrum.fill(0.0);

function initFFTWindow() {
    let fftWindow = new Float32Array(fftSize);
    for(let i = 0; i < fftWindow.length; ++i) {
        let x = i / (fftSize - 1) * Math.PI * 2.0;
        // Blackman-Nuttall-window
        let y = 0.3635819 - 0.4891775 * Math.cos(x) + 0.1365995 * Math.cos(x * 2.0) - 0.0106411 * Math.cos(x * 3.0);
        fftWindow[i] = y * 2.0 / fftSize;
    }
    return fftWindow;
}

function processSamples(samples) {
    for(let i = 0; i < samples.length; ++i) {
        block[blockPosition] = samples[i];
        blockPosition += 1;
        
        if(blockPosition == block.length) {
            for(let j = 0; j < fftInput.length; ++j) {
                fftInput[j] = block[j] * fftWindow[j];
            }
            fft.realTransform(fftOutput, fftInput);
            
            for(let j = 0; j < spectrum.length; ++j) {
                spectrum[j] = Math.hypot(fftOutput[j * 2], fftOutput[j * 2 + 1]);
                spectrum[j] *= Math.sqrt(j) * amplifyFactor;
            }
            drawColumn(spectrum);
            
            for(let j = 0; j < block.length - windowInc; ++j)
                block[j] = block[j + windowInc];
            blockPosition -= windowInc;
        }
    }
}

// SPECTROGRAM RENDERING

function interpolateChannel(a, b, f) {
    return a * (1.0 - f) + b * f;
}

function getColor(x) {
	const colors = [
		[0.0, 0.0, 0.0],
		[0.0, 0.0, 0.75],
		[0.0, 0.75, 0.0],
		[0.8, 0.8, 0.0],
		[0.9, 0.2, 0.2],
		[1.0, 1.0, 1.0]];

	x *= colors.length - 1;
	
    let xi = Math.floor(x);
	let xf = x - xi;
    
	if(xi < 0) {xi = 0; xf = 0;}
	if(xi >= colors.length - 1) {xi = colors.length - 2; xf = 1.0;}
    
	let r = interpolateChannel(colors[xi][0], colors[xi + 1][0], xf);
    let g = interpolateChannel(colors[xi][1], colors[xi + 1][1], xf);
    let b = interpolateChannel(colors[xi][2], colors[xi + 1][2], xf);
    
    return [r, g, b];
}

function logarithmicScale(y)
{
	let min = 0.01;
	let max = 1.0;
	return (Math.log(y + min) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

const offscreenCanvas = new OffscreenCanvas(timePixels, freqPixels);
let offscreenContext = offscreenCanvas.getContext("2d");
clearSpectrogram(offscreenCanvas);

function clearSpectrogram(canvas) {
    let ctx = canvas.getContext("2d");
    ctx.style = "black";
    ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    xcursor = 0;
    scrolledTotal = 0.0;
}

var xcursor = 0;
const xscrollSteps = 2;

function drawColumn(spectrum) {
    var canvas = offscreenCanvas;
    var ctx = offscreenCanvas.getContext("2d");
    
    if(xcursor >= canvas.width)
    {
        xcursor = canvas.width - xscrollSteps;
        ctx.drawImage(canvas, -xscrollSteps, 0);
        ctx.fillStyle = "black";
        ctx.fillRect(canvas.width - xscrollSteps, 0, xscrollSteps, canvas.height);
        scrolledTotal += xscrollSteps;
    }   
    
    var imageData = ctx.createImageData(1, spectrum.length);
    var data = imageData.data;
    
    var ymax = offscreenCanvas.height;
    for(let y = 0; y < ymax; y++) {
        let color = getColor(logarithmicScale(spectrum[ymax - y - 1]));
        data[y * 4 + 0] = color[0] * 255;
        data[y * 4 + 1] = color[1] * 255;
        data[y * 4 + 2] = color[2] * 255;
        data[y * 4 + 3] = 255;
    }
    
    ctx.putImageData(imageData, xcursor, 0);
    xcursor += 1;
    
    if(xcursor % xscrollSteps == 0)
        window.requestAnimationFrame(redrawSpectrogram);
}

// LABELS

var labels = true;
var scrolledTotal = 0.0;

function drawLabels(canvas, ctx) {
    const frequencyGrid = 1000.0;
	const timeGrid = 1.0;

	let timeStart = scrolledTotal * timeResolution;
	let timeEnd = (scrolledTotal + offscreenCanvas.width) * timeResolution;
    
	let frequencySteps = Math.ceil(freqMaximum / frequencyGrid);	
	let timeStepsStart = Math.floor(timeStart / timeGrid) - 1;
	let timeStepsEnd = Math.ceil(timeEnd / timeGrid);

	for(let i = 1; i < frequencySteps; ++i) {
		let text = (i * frequencyGrid / 1000.0).toString() + "kHz";

		let x = 0;
		let y = offscreenCanvas.height - i * frequencyGrid / freqResolution;
        y *= canvas.height / offscreenCanvas.height;
        let extents = ctx.measureText(text);
        
        ctx.font = '1em monospace';
        ctx.fillStyle = "white";
        ctx.fillText(text, x, y + (extents.emHeightAscent || 0) / 2);
	}
    
	for(let i = timeStepsStart; i <= timeStepsEnd; ++i) {
        let text = (i * timeGrid).toString() + "s";
			
		let x = i * timeGrid / timeResolution  - scrolledTotal;
        x *= canvas.width / offscreenCanvas.width;
		let y = canvas.height;
        ctx.fillText(text, x, y);
	}
}


// CLEAR BUTTON 

clearButton.addEventListener('click', function() {
    clearSpectrogram(offscreenCanvas); 
    window.requestAnimationFrame(redrawSpectrogram);
});

// LABELS BUTTON

labelsButton.addEventListener('click', function() {
    labels = !labels;
    labelsButton.classList.toggle('active');
    window.requestAnimationFrame(redrawSpectrogram);
});

// FULLSCREEN BUTTON

function enterFullscreen(element) {
    if(element.requestFullscreen)
        element.requestFullscreen();
    else if(element.msRequestFullscreen)
        element.msRequestFullscreen();
    else if(element.webkitRequestFullscreen)
        element.webkitRequestFullscreen();
}

fullscreenButton.addEventListener('click', function() {
    enterFullscreen(screenCanvas);
});

// RENDER EVERYTHING
function redrawSpectrogram(timestamp) {
    var ctx = screenCanvas.getContext("2d");
    ctx.drawImage(offscreenCanvas, 0, 0, screenCanvas.width, screenCanvas.height);
    if(labels)
        drawLabels(screenCanvas, ctx);
}

// WINDOW RESIZING

function resizeCanvas() {
    const aspect = 0.4;
    let width = window.innerWidth;
    let height = window.innerWidth * aspect;
    
    let buttonsHeight = document.getElementById("buttons").offsetHeight;
    let fitHeight = window.innerHeight - buttonsHeight;

    if(height > fitHeight) {
        let factor = fitHeight / height;
        width *= factor;
        height *= factor;
    } 
    
    screenCanvas.width = width;
    screenCanvas.height = height;
    
    window.requestAnimationFrame(redrawSpectrogram);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
