frappe.provide("ant_tools");

ant_tools.AudioRecorder = class {
  constructor(frm) {
    this.frm = frm;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.audioBlob = null;
    this.seconds = 0;
    this.timerInterval = null;
    this.stream = null;
  }

  show_dialog() {
    this.dialog = new frappe.ui.Dialog({
      title: __("Audio Recording"),
      size: "small",
      fields: [
        {
          fieldtype: "HTML",
          fieldname: "recorder_ui",
          options: this._recorder_html(),
        },
        {
          fieldtype: "HTML",
          fieldname: "preview_ui",
          options: `<div class="audio-preview-area" style="display:none; margin-top:12px;">
            <audio controls class="w-100" id="audio-playback"></audio>
            <p class="text-muted mt-1" id="audio-duration-label" style="font-size:12px;"></p>
          </div>`,
        },
      ],
    });

    // Release mic if user closes via X button
    this.dialog.onhide = () => {
      this._cleanup();
    };

    this.dialog.show();
    this._bind_dialog_events(this.dialog);
  }

  _recorder_html() {
    return `
      <div class="text-center py-3">
        <div class="recorder-status mb-3" style="min-height:32px; display:flex; align-items:center; justify-content:center; gap:8px;">
          <span class="recording-dot text-danger" style="display:none; font-size:20px; line-height:1;">●</span>
          <span class="timer-display text-muted" style="font-size:18px; font-weight:500; font-variant-numeric:tabular-nums;">00:00</span>
        </div>
        <button class="btn btn-outline-danger btn-start-recording">
          <svg class="icon icon-sm"><use href="#icon-audio-lines"></use></svg>
          ${__("Start Recording")}
        </button>
        <button class="btn btn-outline-warning btn-stop-recording" style="display:none;">
          <svg class="icon icon-sm"><use href="#icon-stop"></use></svg>
          ${__("Stop")}
        </button>
        <div class="btn-group-action mt-3" style="display:none;">
          <button class="btn btn-primary btn-upload-audio" style="margin-right:8px;">
            ${__("Upload & Attach")}
          </button>
          <button class="btn btn-default btn-discard-audio">
            ${__("Discard")}
          </button>
        </div>
      </div>
    `;
  }

  _bind_dialog_events(dialog) {
    const $w = dialog.$wrapper;
    $w.find(".btn-start-recording").on("click", () => this._start());
    $w.find(".btn-stop-recording").on("click", () => this._stop());
    $w.on("click", ".btn-upload-audio", () => this._upload_audio());
    $w.on("click", ".btn-discard-audio", () => {
      this._cleanup();
      dialog.hide();
    });
  }

  _start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      frappe.msgprint(__("Audio recording not supported in this browser."));
      return;
    }

    const $w = this.dialog.$wrapper;
    $w.find(".btn-start-recording").hide();
    $w.find(".btn-stop-recording").show();
    $w.find(".recording-dot").show();
    $w.find(".timer-display").removeClass("text-muted").addClass("text-danger");

    this.seconds = 0;
    this._update_timer();
    this.timerInterval = setInterval(() => {
      this.seconds++;
      this._update_timer();
    }, 1000);

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        this.stream = stream;
        this.audioChunks = [];

        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";

        this.mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size) this.audioChunks.push(e.data);
        };
        this.mediaRecorder.onstop = () => this._on_stop();
        this.mediaRecorder.start();
      })
      .catch((err) => {
        frappe.msgprint(__("Microphone access denied: {0}", [err.message]));
        this._reset_ui();
      });
  }

  _stop() {
    this.mediaRecorder?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    clearInterval(this.timerInterval);
  }

  _on_stop() {
    this.audioBlob = new Blob(this.audioChunks, {
      type: this.mediaRecorder?.mimeType || "audio/webm",
    });

    const url = URL.createObjectURL(this.audioBlob);
    const $w = this.dialog.$wrapper;

    $w.find(".btn-stop-recording").hide();
    $w.find(".recording-dot").hide();
    $w.find(".timer-display").removeClass("text-danger").addClass("text-muted");

    $w.find("#audio-playback").attr("src", url);
    $w.find(".audio-preview-area").show();
    $w.find("#audio-duration-label").text(
      __("Duration: {0}", [this._format_duration(this.seconds)])
    );

    $w.find(".btn-group-action").show();
  }

  async _upload_audio() {
    if (!this.audioBlob) return;

    const $w = this.dialog.$wrapper;
    $w.find(".btn-upload-audio").prop("disabled", true).text(__("Uploading..."));
    $w.find(".btn-discard-audio").prop("disabled", true);

    const duration = this._format_duration(this.seconds);
    const file = new File([this.audioBlob], `recording-${Date.now()}.webm`, {
      type: this.audioBlob.type,
    });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("doctype", this.frm.doctype);
      formData.append("docname", this.frm.docname);
      formData.append("is_private", "0");
      formData.append("folder", "Home/Attachments");

      const uploadRes = await fetch("/api/method/upload_file", {
        method: "POST",
        headers: { "X-Frappe-CSRF-Token": frappe.csrf_token },
        body: formData,
      });

      const uploadData = await uploadRes.json();

      if (!uploadData.message?.file_url) {
        throw new Error("Upload failed: no file_url in response");
      }

      const file_url = uploadData.message.file_url;

      await frappe.call({
        method: "frappe.desk.form.utils.add_comment",
        args: {
          reference_doctype: this.frm.doctype,
          reference_name: this.frm.docname,
          content: `<div style="display:flex; align-items:center; gap:10px; padding:4px 0;">
            <span style="font-size:20px;">🎙</span>
            <div style="flex:1;">
              <audio controls src="${file_url}" style="width:100%; height:36px;"></audio>
              <div style="font-size:11px; color:#888; margin-top:2px;">Voice note · ${duration}</div>
            </div>
          </div>`,
          comment_email: frappe.session.user,
          comment_by: frappe.session.user_fullname,
        },
      });

      frappe.show_alert({
        message: __("Voice note added to {0}", [this.frm.docname]),
        indicator: "green",
      });

      this.frm.reload_doc();
      this._cleanup();
      this.dialog.hide();
    } catch (err) {
      console.error("Voice upload error:", err);
      frappe.msgprint(__("Failed: {0}", [err.message || "Unknown error"]));
      $w.find(".btn-upload-audio").prop("disabled", false).text(__("Upload & Attach"));
      $w.find(".btn-discard-audio").prop("disabled", false);
    }
  }

  _update_timer() {
    this.dialog.$wrapper
      .find(".timer-display")
      .text(this._format_duration(this.seconds));
  }

  _format_duration(s) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  _cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    clearInterval(this.timerInterval);
    this.audioBlob = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.seconds = 0;
  }

  _reset_ui() {
    if (!this.dialog) return;
    const $w = this.dialog.$wrapper;
    $w.find(".btn-start-recording").show();
    $w.find(".btn-stop-recording").hide();
    $w.find(".recording-dot").hide();
    $w.find(".timer-display")
      .text("00:00")
      .removeClass("text-danger")
      .addClass("text-muted");
    clearInterval(this.timerInterval);
  }
};

// Register via timeline_refresh event — adds button directly in Activity section
frappe.ui.form.on('*', {
  timeline_refresh: function(frm) {
    if (!frm.docname || frm.doc.__islocal) return;
    if (["Document Activity", "DocType"].includes(frm.doctype)) return;
    if (frm.ant_audio_button_added) return;
    frm.ant_audio_button_added = true;

    frm.timeline.add_action_button(
      __("Record Audio"),
      () => {
        if (!frm.ant_audio_recorder) {
          frm.ant_audio_recorder = new ant_tools.AudioRecorder(frm);
        }
        frm.ant_audio_recorder.show_dialog();
      },
      "audio-lines",
      "btn-secondary"
    );
  }
});