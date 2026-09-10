/* =========================================================
   SAR DEFENCE MONITORING SYSTEM
   FRONTEND SCRIPT
========================================================= */


/* =========================================================
   GLOBAL VARIABLES
========================================================= */

let ctx = null;

let running = false;

let start = 0;

let currentOscillator = null;

let alertTimeout = null;



/* =========================================================
   CLOCK
========================================================= */

function clock() {

    document.getElementById("clock").textContent =
        new Date().toLocaleTimeString();

}

setInterval(clock, 1000);

clock();



/* =========================================================
   MODEL STATUS
========================================================= */

async function status() {

    try {

        const response =
            await fetch("/api/status");


        const data =
            await response.json();


        const statusElement =
            document.getElementById("status");


        if (data.ready) {

            statusElement.textContent =
                "● ALL MODELS READY";

            statusElement.className =
                "ready";


            document.getElementById(
                "run"
            ).disabled = false;

        }


        else if (data.error) {

            statusElement.textContent =
                "● MODEL ERROR";

            statusElement.className =
                "error";


            document.getElementById(
                "run"
            ).disabled = true;


            console.error(
                "Model error:",
                data.error
            );

        }

    }


    catch (error) {

        console.error(
            "Backend connection error:",
            error
        );

    }

}



/* =========================================================
   RUN RANDOM TEST IMAGE
========================================================= */

async function runTest() {

    const button =
        document.getElementById("run");


    button.disabled =
        true;


    button.textContent =
        "PROCESSING...";


    try {

        /* ==============================================
           CALL FLASK BACKEND
        ============================================== */

        const response =
            await fetch(
                "/api/random-test",
                {
                    method: "POST"
                }
            );


        const data =
            await response.json();


        if (!data.success) {

            throw new Error(
                data.error
            );

        }



        /* ==============================================
           DISPLAY PROCESSED IMAGE
        ============================================== */

        const image =
            document.getElementById("result");


        image.src =
            data.image;


        image.className =
            "show";


        document.getElementById(
            "placeholder"
        ).style.display =
            "none";


        document.getElementById(
            "imageStatus"
        ).textContent =
            "Selected: " + data.filename;



        /* ==============================================
           DISPLAY CRITICAL COUNT
        ============================================== */

        document.getElementById(
            "critical"
        ).textContent =
            data.critical_count;



        /* ==============================================
           DISPLAY DETECTION RESULTS
        ============================================== */

        const tableBody =
            document.getElementById(
                "rows"
            );


        tableBody.innerHTML =
            "";


        if (!data.results.length) {

            tableBody.innerHTML =
                `
                <tr>
                    <td colspan="5">
                        No vehicles detected.
                    </td>
                </tr>
                `;

        }



        /* ==============================================
           ADD EACH VEHICLE RESULT
        ============================================== */

        for (
            const result of data.results
        ) {

            const threatClass =
                result.threat.toLowerCase();


            tableBody.innerHTML += `

                <tr>

                    <td>
                        Detected
                        (${result.yolo_confidence.toFixed(2)})
                    </td>


                    <td>
                        ${result.broad}
                        (${result.broad_confidence.toFixed(2)})
                    </td>


                    <td>
                        ${result.specific}
                        (${result.specific_confidence.toFixed(2)})
                    </td>


                    <td>
                        ${result.score.toFixed(2)}
                    </td>


                    <td class="t-${threatClass}">
                        ${result.threat}
                    </td>

                </tr>

            `;

        }



        /* ==============================================
           CRITICAL VEHICLE ALERT
        ============================================== */

        if (
            data.critical_count > 0
        ) {

            startAlert(60);

        }

        else {

            stopAlert(false);

        }

    }


    catch (error) {

        alert(
            error.message
        );


        console.error(
            "TEST ERROR:",
            error
        );

    }


    finally {

        button.disabled =
            false;


        button.textContent =
            "◈ RANDOM TEST IMAGE";

    }

}



/* =========================================================
   NEW EMERGENCY ALERT SOUND
========================================================= */

function startAlert(seconds) {


    /*
       Do not start another alert
       if one is already running.
    */

    if (running) {

        return;

    }


    try {


        /* ==============================================
           CREATE AUDIO CONTEXT
        ============================================== */

        ctx =
            ctx ||
            new (
                window.AudioContext ||
                window.webkitAudioContext
            )();


        /*
           Resume audio context.
        */

        ctx.resume();


        running =
            true;


        start =
            Date.now();



        /* ==============================================
           ENABLE STOP ALERT BUTTON
        ============================================== */

        const stopButton =
            document.getElementById(
                "stopAlert"
            );


        if (stopButton) {

            stopButton.disabled =
                false;


            stopButton.textContent =
                "🔇 STOP ALERT";

        }



        /* ==============================================
           EMERGENCY ALARM
        ============================================== */

        function beep() {


            /*
               Check whether alert
               was manually stopped.
            */

            if (!running) {

                return;

            }



            /*
               Automatic 60-second limit.
            */

            if (
                Date.now() - start
                >= seconds * 1000
            ) {

                stopAlert();

                return;

            }



            /* ==========================================
               CREATE OSCILLATOR
            ========================================== */

            const oscillator =
                ctx.createOscillator();


            const gain =
                ctx.createGain();


            currentOscillator =
                oscillator;



            /* ==========================================
               FAST PULSING SOUND
            ========================================== */

            oscillator.type =
                "square";


            /*
               Start frequency.
            */

            oscillator.frequency.setValueAtTime(
                1100,
                ctx.currentTime
            );


            /*
               Quickly change frequency.
            */

            oscillator.frequency.setValueAtTime(
                1700,
                ctx.currentTime + 0.18
            );


            /*
               Change back.
            */

            oscillator.frequency.setValueAtTime(
                1100,
                ctx.currentTime + 0.35
            );



            /* ==========================================
               SOUND VOLUME
            ========================================== */

            gain.gain.setValueAtTime(
                0.0001,
                ctx.currentTime
            );


            gain.gain.exponentialRampToValueAtTime(
                0.22,
                ctx.currentTime + 0.02
            );


            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                ctx.currentTime + 0.35
            );



            /* ==========================================
               CONNECT AUDIO
            ========================================== */

            oscillator.connect(
                gain
            );


            gain.connect(
                ctx.destination
            );



            /* ==========================================
               PLAY SOUND
            ========================================== */

            oscillator.start();


            oscillator.stop(
                ctx.currentTime + 0.35
            );



            /* ==========================================
               NEXT ALERT PULSE
            ========================================== */

            alertTimeout =
                setTimeout(
                    beep,
                    500
                );

        }



        /*
           Start the first beep.
        */

        beep();

    }


    catch (error) {

        console.error(
            "Audio error:",
            error
        );

    }

}



/* =========================================================
   STOP ALERT
========================================================= */

function stopAlert(
    resetButton = true
) {


    /*
       Stop alert state.
    */

    running =
        false;



    /* ==============================================
       STOP CURRENT OSCILLATOR
    ============================================== */

    if (
        currentOscillator
    ) {

        try {

            currentOscillator.stop();

        }

        catch (error) {

            /*
               Oscillator may already
               have stopped naturally.
            */

        }


        currentOscillator =
            null;

    }



    /* ==============================================
       CLEAR NEXT ALERT TIMER
    ============================================== */

    if (
        alertTimeout
    ) {

        clearTimeout(
            alertTimeout
        );


        alertTimeout =
            null;

    }



    /* ==============================================
       RESET STOP BUTTON
    ============================================== */

    if (resetButton) {

        const stopButton =
            document.getElementById(
                "stopAlert"
            );


        if (stopButton) {

            stopButton.disabled =
                true;


            stopButton.textContent =
                "🔇 STOP ALERT";

        }

    }

}



/* =========================================================
   RESET RESULTS
========================================================= */

function reset() {


    /*
       Stop any active alert.
    */

    stopAlert();



    /* ==============================================
       CLEAR IMAGE
    ============================================== */

    const image =
        document.getElementById(
            "result"
        );


    image.className =
        "";


    image.src =
        "";



    /* ==============================================
       SHOW PLACEHOLDER
    ============================================== */

    document.getElementById(
        "placeholder"
    ).style.display =
        "block";



    /* ==============================================
       RESET IMAGE STATUS
    ============================================== */

    document.getElementById(
        "imageStatus"
    ).textContent =
        "No test image selected";



    /* ==============================================
       RESET CRITICAL COUNT
    ============================================== */

    document.getElementById(
        "critical"
    ).textContent =
        "0";



    /* ==============================================
       CLEAR DETECTION TABLE
    ============================================== */

    document.getElementById(
        "rows"
    ).innerHTML =

        `
        <tr>
            <td colspan="5">
                No results to display.
            </td>
        </tr>
        `;

}



/* =========================================================
   INITIALIZATION
========================================================= */


/*
   Disable test button until
   models are ready.
*/

document.getElementById(
    "run"
).disabled =
    true;



/*
   Check model status.
*/

status();



/*
   Check model status every 5 seconds.
*/

setInterval(
    status,
    5000
);
