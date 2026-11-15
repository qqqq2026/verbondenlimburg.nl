/* Aanmeldformulier Verbonden Limburg
 * Stuurt JSON naar de n8n-webhook (workflow "Verbonden Limburg Aanmeldformulier").
 * Veldnamen moeten exact gelijk blijven aan wat de workflow leest:
 *   rol, doel[], thema[], naam, org, mail, tel, gemeente, bericht,
 *   akkoord (true), naamsvermelding (boolean), website (honeypot, moet leeg zijn).
 * Antwoorden: 200 {ok:true} = gelukt (ook bij spam), 400 {ok:false,error} = afgewezen.
 * Let op: de webhook accepteert alleen Origin verbondenlimburg.nl / www / qqqq2026.github.io,
 * dus een lokale preview krijgt een CORS-fout. Dat is verwacht.
 */
(function () {
  "use strict";
  var ENDPOINT = "https://n8n.srv1483895.hstgr.cloud/webhook/verbondenlimburg-aanmelding";
  var TIMEOUT_MS = 20000;
  var MAILRE = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']{2,}$/; // zelfde regel als n8n
  var ALTIJD_DOEL = "Nieuwste versie ontvangen";
  var FAIL = "Het versturen is niet gelukt. Controleer uw internetverbinding en probeer het over een paar minuten opnieuw. Lukt het dan nog niet, mail ons op aanmeldingen@verbondenlimburg.nl.";
  var SERVER_MSG = {
    "naam ontbreekt": "Vul uw naam in.",
    "ongeldig e-mailadres": "Dit e-mailadres lijkt niet te kloppen. Kijkt u het nog even na?",
    "kies minstens een manier om mee te doen": "Kies hoe u wilt meedoen.",
    "toestemming ontbreekt": "We hebben uw toestemming nodig om uw gegevens te bewaren."
  };

  var f = document.getElementById("f");
  if (!f) return;
  var err = document.getElementById("err"),
      done = document.getElementById("done"),
      sum = document.getElementById("summary"),
      title = document.getElementById("done-title"),
      btn = f.querySelector('button[type="submit"]'),
      again = document.getElementById("again");
  var btnLabelNode = btn && btn.firstChild && btn.firstChild.nodeType === 3 ? btn.firstChild : null;
  var btnLabel = btnLabelNode ? btnLabelNode.nodeValue : "";
  var busy = false;

  err.setAttribute("role", "alert");
  err.setAttribute("tabindex", "-1");

  function vals(name) {
    return Array.prototype.map.call(
      f.querySelectorAll('input[name="' + name + '"]:checked'),
      function (i) { return i.value; });
  }

  function fieldMsgEl(input) {
    var id = input.id + "-msg", el = document.getElementById(id);
    if (!el) {
      el = document.createElement("span");
      el.id = id; el.className = "field-msg"; el.hidden = true;
      input.insertAdjacentElement("afterend", el);
    }
    return el;
  }
  function setInvalid(input, msg) {
    var el = fieldMsgEl(input);
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", el.id);
    el.textContent = msg; el.hidden = false;
  }
  function clearInvalid(input) {
    input.removeAttribute("aria-invalid");
    var el = document.getElementById(input.id + "-msg");
    if (el) { el.hidden = true; el.textContent = ""; }
  }
  function showErr(msg) { err.textContent = msg; err.hidden = false; err.focus(); }
  function hideErr() { err.hidden = true; err.textContent = ""; }

  function validate() {
    var first = null, naam = f.naam, mail = f.mail;
    [naam, mail].forEach(clearInvalid);
    if (!naam.value.trim()) { setInvalid(naam, "Vul uw naam in."); first = first || naam; }
    var m = mail.value.trim();
    if (!m) { setInvalid(mail, "Vul uw e-mailadres in."); first = first || mail; }
    else if (!MAILRE.test(m)) { setInvalid(mail, "Vul een geldig e-mailadres in, bijvoorbeeld naam@bedrijf.nl."); first = first || mail; }
    return first;
  }

  // Controle per veld zodra iemand het veld verlaat, en opnieuw bij typen na een fout.
  ["naam", "mail"].forEach(function (n) {
    var el = f[n];
    el.addEventListener("blur", function () { if (el.value.trim()) validate(); });
    el.addEventListener("input", function () { if (el.getAttribute("aria-invalid")) validate(); });
  });

  function setBusy(on) {
    busy = on;
    btn.disabled = on;
    f.setAttribute("aria-busy", on ? "true" : "false");
    btn.classList.toggle("is-busy", on);
    if (btnLabelNode) btnLabelNode.nodeValue = on ? "Bezig met versturen… " : btnLabel;
  }

  function post(data) {
    var ctrl = "AbortController" in window ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok && j.ok !== false) return j;
        var e = new Error("status " + r.status);
        e.server = j && j.error; throw e;
      });
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  function buildData() {
    var doel = vals("doel");
    if (doel.indexOf(ALTIJD_DOEL) < 0) doel.push(ALTIJD_DOEL);
    return {
      rol: vals("rol")[0] || "",
      doel: doel,
      thema: vals("thema"),
      naam: f.naam.value.trim(),
      org: f.org ? f.org.value.trim() : "",
      mail: f.mail.value.trim(),
      tel: f.tel ? f.tel.value.trim() : "",
      gemeente: f.gemeente ? f.gemeente.value : "",
      bericht: f.bericht ? f.bericht.value.trim() : "",
      akkoord: true,
      naamsvermelding: !!(f.naamsvermelding && f.naamsvermelding.checked),
      website: f.website ? f.website.value : ""
    };
  }

  function summary(d) {
    return [
      "Naam: " + d.naam,
      "Organisatie: " + (d.org || "-"),
      "E-mail: " + d.mail,
      "Telefoon: " + (d.tel || "-"),
      "Gemeente: " + (d.gemeente || "-"),
      "Ik meld me aan als: " + (d.rol || "-"),
      "Ik wil: " + d.doel.join(", "),
      "Interesse in: " + (d.thema.join(", ") || "-"),
      "Bijdrage: " + (d.bericht || "-"),
      "Naam op de website: " + (d.naamsvermelding ? "ja" : "nee"),
      "Nieuwste versie per e-mail: ja"
    ].join("\n");
  }

  f.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    hideErr();
    var bad = validate();
    if (bad) { bad.focus(); return; }
    var data = buildData();
    setBusy(true);
    post(data).then(function () {
      sum.textContent = summary(data);
      title.textContent = "Dank u wel, " + data.naam.split(/\s+/)[0] + ". Fijn dat u meedoet.";
      f.hidden = true; done.hidden = false;
      done.setAttribute("tabindex", "-1");
      done.scrollIntoView({ behavior: "smooth", block: "start" });
      done.focus({ preventScroll: true });
    }).catch(function (ex) {
      showErr((ex && ex.server && SERVER_MSG[ex.server]) || FAIL);
    }).then(function () { setBusy(false); });
  });

  if (again) again.addEventListener("click", function () {
    f.reset(); ["naam", "mail"].forEach(function (n) { clearInvalid(f[n]); });
    hideErr(); done.hidden = true; f.hidden = false; f.naam.focus();
  });
})();
