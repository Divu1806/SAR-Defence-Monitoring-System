let ctx = null;
let running = false;
let start = 0;
let alertTimer = null;
let currentOscillator = null;

function log(x) {
    let l = document.getElementById("log");
    l.innerHTML += `<br>[${new Date().toLocaleTimeString()}] ${x}`;
    l.scrollTop = l.scrollHeight;
}

function clock() {
    document.getElementById("clock").textContent =
        new Date().toLocaleTimeString();
}

setInterval(clock, 1000);
clock();

async function status() {
    try {
        let d = await (await fetch("/api/status")).json();
        let s = document.getElementById("status");

        if (d.ready) {
            s.textContent = "● ALL MODELS READY";
            s.className = "ready";
            document.getElementById("run").disabled = false;
        }
        else if (d.error) {
            s.textContent = "● MODEL ERROR";
            s.className = "error";
            document.getElementById("run").disabled = true;
            log(d.error);
        }

    } catch (e) {
        log("Backend connection error.");
    }
}


async function runTest() {

    let b = document.getElementById("run");

    b.disabled = true;
    b.textContent = "PROCESSING...";

    log("Selecting one random image...");

    try {

        let d = await (
            await fetch(
                "/api/random-test",
                {
                    method: "POST"
                }
            )
        ).json();

        if (!d.success) {
            throw Error(d.error);
        }

        let im = document.getElementById("result");

        im.src = d.image;
        im.className = "show";

        document.getElementById("placeholder").style.display = "none";

        document.getElementById("imageStatus").textContent =
            "Selected: " + d.filename;

        document.getElementById("critical").textContent =
            d.critical_count;

        let body = document.getElementById("rows");

        body.innerHTML = "";

        if (!d.results.length) {

            body.innerHTML =
                '<tr><td colspan="5">No vehicles detected.</td></tr>';
        }

        for (let r of d.results) {

            let c = r.threat.toLowerCase();

            body.innerHTML += `
                <tr>
                    <td>
                        Detected (${r.yolo_confidence.toFixed(2)})
                    </td>

                    <td>
                        ${r.broad}
                        (${r.broad_confidence.toFixed(2)})
                    </td>

                    <td>
                        ${r.specific}
                        (${r.specific_confidence.toFixed(2)})
                    </td>

                    <td>
                        ${r.score.toFixed(2)}
                    </td>

                    <td class="t-${c}">
                        ${r.threat}
                    </td>
                </tr>
            `;
        }

        log(
            "YOLO → CNN #1 → CNN #2 → Threat completed."
        );

        log(
            "Vehicles detected: " + d.vehicle_count
        );

        log(
            "Critical vehicles: " + d.critical_count
        );

        if (d.critical_count) {
            startAlert(60);
        }

    }
    catch (e) {

        alert(e.message);

        log(
            "TEST ERROR: " + e.message
        );

    }
    finally {

        b.disabled = false;
        b.textContent = "◈ RANDOM TEST IMAGE";
    }
}


/* =========================================================
   START CRITICAL ALERT
   ========================================================= */

function startAlert(sec) {

    if (running) {
        return;
    }

    try {

        ctx = ctx || new AudioContext();

        ctx.resume();

        running = true;

        start = Date.now();

        /* Enable STOP ALERT button */

        let stopButton =
            document.getElementById("stopAlert");

        if (stopButton) {
            stopButton.disabled = false;
            stopButton.textContent = "🔇 STOP ALERT";
        }

        log(
            "!!! CRITICAL ALERT SOUND STARTED !!!"
        );

        let pattern = [
            [900, 180],
            [1300, 180],
            [1650, 260],
            [1300, 180],
            [900, 420]
        ];

        let i = 0;

        function beep() {

            if (!running) {
                return;
            }

            /* 60-second automatic limit */

            if (Date.now() - start >= sec * 1000) {

                stopAlert();

                return;
            }

            let [frequency, duration] =
                pattern[i++ % pattern.length];

            let oscillator =
                ctx.createOscillator();

            let gain =
                ctx.createGain();

            currentOscillator =
                oscillator;

            oscillator.type = "square";

            oscillator.frequency.value =
                frequency;

            gain.gain.setValueAtTime(
                0.0001,
                ctx.currentTime
            );

            gain.gain.exponentialRampToValueAtTime(
                0.12,
                ctx.currentTime + 0.01
            );

            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                ctx.currentTime + duration / 1000
            );

            oscillator.connect(gain);

            gain.connect(ctx.destination);

            oscillator.start();

            oscillator.stop(
                ctx.currentTime + duration / 1000
            );

            setTimeout(
                beep,
                duration + 130
            );
        }

        beep();

    }
    catch (e) {

        log(
            "Browser sound unavailable; click the page and test again."
        );
    }
}


/* =========================================================
   STOP CRITICAL ALERT
   ========================================================= */

function stopAlert() {

    running = false;

    /* Stop current sound immediately */

    if (currentOscillator) {

        try {
            currentOscillator.stop();
        }
        catch (e) {
            /* oscillator may already be stopped */
        }

        currentOscillator = null;
    }

    /* Cancel pending timers */

    if (alertTimer) {

        clearTimeout(alertTimer);

        alertTimer = null;
    }

    /* Disable STOP button */

    let stopButton =
        document.getElementById("stopAlert");

    if (stopButton) {

        stopButton.disabled = true;
        stopButton.textContent = "STOP ALERT ";
    }

    log(
        "Critical alert sound stopped by operator."
    );
}


/* =========================================================
   RESET
   ========================================================= */

function reset() {

    /* Stop alert first */

    stopAlert();

    document.getElementById("result").className = "";

    document.getElementById("result").src = "";

    document.getElementById("placeholder").style.display =
        "block";

    document.getElementById("imageStatus").textContent =
        "No test image selected";

    document.getElementById("critical").textContent =
        "0";

    document.getElementById("rows").innerHTML =
        '<tr><td colspan="5">No results to display.</td></tr>';

    log(
        "Results reset."
    );
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.getElementById("run").disabled = true;

status();

setInterval(
    status,
    5000
);