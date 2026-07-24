"use strict";

/* =========================================================
   SÖDERMAN FASTIGHET – GEMENSAMT SCRIPT
   ---------------------------------------------------------
   Innehåller:
   1. Inläsning av menu.html
   2. Inläsning av footer.html
   3. Aktiv menylänk
   4. Inläsning av fastighet.json
   5. Automatiska beskrivningsfiler
   6. Automatiska bilder
   7. Automatiska planritningar
   8. Visning av lediga objekt, kategorier och detaljsida
   ========================================================= */

const DATAFIL = "fastighet.json";
const BESKRIVNING_MAPP = "beskrivningar";
const BILD_MAPP = "bilder";
const PLANRITNING_MAPP = "planritningar";

/* Cache för att undvika upprepade nätverksanrop */
const filFinnsCache = new Map();
const textCache = new Map();
let dataCache = null;
let foretagsEpost = "";

/* =========================================================
   MENY OCH FOOTER
   ========================================================= */

async function hamtaHtml(filnamn) {
    const svar = await fetch(filnamn, { cache: "no-store" });

    if (!svar.ok) {
        throw new Error(`Kunde inte läsa ${filnamn}: ${svar.status}`);
    }

    return svar.text();
}

function hittaBehallare(ids) {
    for (const id of ids) {
        const element = document.getElementById(id);
        if (element) return element;
    }

    return null;
}

async function laddaMeny() {
    const behallare = hittaBehallare([
        "menu-placeholder",
        "menu-container",
        "meny",
        "menu"
    ]);

    if (!behallare) return;

    try {
        behallare.innerHTML = await hamtaHtml("menu.html");
        markeraAktivMeny();
    } catch (fel) {
        console.error(fel);
        behallare.innerHTML =
            '<div class="alert alert-warning m-3">Menyn kunde inte läsas in.</div>';
    }
}

async function laddaFooter() {
    const behallare = hittaBehallare([
        "footer-placeholder",
        "footer-container",
        "sidfot",
        "footer"
    ]);

    if (!behallare) return;

    try {
        behallare.innerHTML = await hamtaHtml("footer.html");
    } catch (fel) {
        console.error(fel);
    }
}

function markeraAktivMeny() {
    const aktuellFil =
        window.location.pathname.split("/").pop() || "index.html";

    document.querySelectorAll(
        "#menu-placeholder a, #menu-container a, #meny a, #menu a"
    ).forEach(lank => {
        const href = lank.getAttribute("href");

        if (!href || href.startsWith("#") || href.startsWith("http")) {
            return;
        }

        const lankFil = href.split("?")[0].split("#")[0];

        if (
            lankFil === aktuellFil ||
            (aktuellFil === "" && lankFil === "index.html")
        ) {
            lank.classList.add("active");
            lank.setAttribute("aria-current", "page");
        }
    });
}

/* =========================================================
   HJÄLPFUNKTIONER
   ========================================================= */

async function finnsFil(sokvag) {
    if (filFinnsCache.has(sokvag)) {
        return filFinnsCache.get(sokvag);
    }

    const kontroll = (async () => {
        try {
            const svar = await fetch(sokvag, {
                method: "HEAD",
                cache: "no-store"
            });

            return svar.ok;
        } catch {
            return false;
        }
    })();

    filFinnsCache.set(sokvag, kontroll);
    return kontroll;
}

async function hamtaText(sokvag) {
    if (textCache.has(sokvag)) {
        return textCache.get(sokvag);
    }

    const hamtning = (async () => {
        const svar = await fetch(sokvag, { cache: "no-store" });

        if (!svar.ok) {
            throw new Error(`Kunde inte läsa ${sokvag}: ${svar.status}`);
        }

        return svar.text();
    })();

    textCache.set(sokvag, hamtning);

    try {
        return await hamtning;
    } catch (fel) {
        textCache.delete(sokvag);
        throw fel;
    }
}

function arKortnamn(varde) {
    return (
        typeof varde === "string" &&
        varde.trim() !== "" &&
        !varde.includes("/") &&
        !varde.includes("\\") &&
        !varde.includes(".")
    );
}

function escapeHtml(text) {
    return String(text ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatHyra(hyra) {
    return Number(hyra) > 0
        ? `${new Intl.NumberFormat("sv-SE").format(hyra)} kr/mån`
        : "Kontakta oss";
}

function formatDatum(datum) {
    if (!datum) return "Kontakta oss";

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);

    if (!match) return datum;

    return `${match[3]}/${match[2]} ${match[1]}`;
}

/* =========================================================
   BESKRIVNINGAR
   ========================================================= */

async function lasBeskrivning(objekt) {
    const varde = objekt.bilder;

    if (!arKortnamn(varde)) {
        objekt.beskrivningText = "";
        return;
    }

    const sokvagar = [
        `${BESKRIVNING_MAPP}/${varde}.txt`,
        `${BESKRIVNING_MAPP}/${varde}-beskrivning.txt`
    ];

    for (const sokvag of sokvagar) {
        try {
            objekt.beskrivningText = await hamtaText(sokvag);
            return;
        } catch {
            // Prova nästa filnamn.
        }
    }

    objekt.beskrivningText = "";
}

function formatBeskrivning(objekt) {
    return escapeHtml(
        objekt.beskrivningText ?? objekt.beskrivning ?? ""
    )
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n/g, "<br>");
}

/* =========================================================
   BILDER
   ========================================================= */

async function hittaAutomatiskaBilder(kortnamn, maxAntal = 20) {
    const resultat = [];

    for (let nummer = 1; nummer <= maxAntal; nummer++) {
        let hittad = false;

        for (const andelse of [
            "jpg", "JPG",
            "jpeg", "JPEG",
            "png", "PNG",
            "webp", "WEBP"
        ]) {
            const sokvag =
                `${BILD_MAPP}/${kortnamn}-${nummer}.${andelse}`;

            if (await finnsFil(sokvag)) {
                resultat.push(sokvag);
                hittad = true;
                break;
            }
        }

        if (!hittad) break;
    }

    return resultat;
}

async function lasBilder(objekt) {
    const varde = objekt.bilder;

    if (Array.isArray(varde)) {
        objekt.bildLista = varde;
        return;
    }

    if (arKortnamn(varde)) {
        objekt.bildLista = await hittaAutomatiskaBilder(
            varde,
            objekt.typ === "lagenhet" ? 30 : 15
        );
        return;
    }

    objekt.bildLista = [];
}

function bilder(objekt) {
    return objekt.bildLista ??
        (Array.isArray(objekt.bilder) ? objekt.bilder : []);
}

/* =========================================================
   PLANRITNINGAR
   ========================================================= */

async function lasPlanritning(objekt) {
    const varde = objekt.bilder;

    if (!arKortnamn(varde)) {
        objekt.planritningFil = "";
        return;
    }

    const sokvag = `${PLANRITNING_MAPP}/${varde}.pdf`;
    objekt.planritningFil = await finnsFil(sokvag) ? sokvag : "";
}

function planritningsKnapp(objekt) {
    if (!objekt.planritningFil) return "";

    return `
        <a class="btn btn-outline-secondary ms-2"
           href="${escapeHtml(objekt.planritningFil)}"
           target="_blank"
           rel="noopener">
            Visa planritning
        </a>
    `;
}

/* =========================================================
   FASTIGHETSDATA
   ========================================================= */

async function hamtaData() {
    if (dataCache) {
        return dataCache;
    }

    dataCache = (async () => {
        const svar = await fetch(DATAFIL, { cache: "no-store" });

        if (!svar.ok) {
            throw new Error(`Kunde inte läsa ${DATAFIL}: ${svar.status}`);
        }

        const data = await svar.json();
        foretagsEpost = data.foretag?.epost?.trim() || "";

        await Promise.all(
            (data.objekt ?? []).map(async objekt => {
                await Promise.all([
                    lasBeskrivning(objekt),
                    lasBilder(objekt),
                    lasPlanritning(objekt)
                ]);
            })
        );

        return data;
    })();

    try {
        return await dataCache;
    } catch (fel) {
        dataCache = null;
        throw fel;
    }
}

function ledigaObjekt(data, typ = null) {
    return (data.objekt ?? [])
        .filter(objekt =>
            objekt.ledigt === true &&
            (!typ || objekt.typ === typ)
        )
        .sort((a, b) =>
            (a.prioritet ?? 999) - (b.prioritet ?? 999)
        );
}

/* =========================================================
   BILDCAROUSEL
   ========================================================= */

function carousel(objekt) {
    const objektbilder = bilder(objekt);

    if (!objektbilder.length) {
        return `
            <img src="bilder/hero.jpg"
                 class="object-image"
                 alt="${escapeHtml(objekt.rubrik)}">
        `;
    }

    if (objektbilder.length === 1) {
        return `
            <img src="${escapeHtml(objektbilder[0])}"
                 class="object-image"
                 alt="${escapeHtml(objekt.rubrik)}">
        `;
    }

    const carouselId = `carousel-${objekt.id}`;

    return `
        <div id="${carouselId}"
             class="carousel slide h-100"
             data-bs-ride="false">

            <div class="carousel-inner h-100">
                ${objektbilder.map((bild, index) => `
                    <div class="carousel-item ${index === 0 ? "active" : ""}">
                        <img src="${escapeHtml(bild)}"
                             class="d-block w-100 object-image"
                             alt="${escapeHtml(objekt.rubrik)}, bild ${index + 1}">
                    </div>
                `).join("")}
            </div>

            <button class="carousel-control-prev"
                    type="button"
                    data-bs-target="#${carouselId}"
                    data-bs-slide="prev">
                <span class="carousel-control-prev-icon"></span>
                <span class="visually-hidden">Föregående</span>
            </button>

            <button class="carousel-control-next"
                    type="button"
                    data-bs-target="#${carouselId}"
                    data-bs-slide="next">
                <span class="carousel-control-next-icon"></span>
                <span class="visually-hidden">Nästa</span>
            </button>
        </div>
    `;
}

function skapaIntresseMailto(objekt) {
    if (!foretagsEpost) return "kontakt.html";

    const amne = `Intresse för ${objekt.rubrik}`;
    const meddelande = `Hej!

Jag är intresserad av:

${objekt.rubrik}

Namn:

Telefon:

Meddelande:
`;

    return `mailto:${foretagsEpost}?subject=${encodeURIComponent(amne)}&body=${encodeURIComponent(meddelande)}`;
}

/* =========================================================
   OBJEKTKORT
   ========================================================= */

function skapaObjektkort(objekt) {
    return `
        <article class="card shadow service-card mb-4">
            <div class="row g-0">
                <div class="col-lg-5">
                    ${carousel(objekt)}
                </div>

                <div class="col-lg-7">
                    <div class="card-body p-4">
                        <span class="badge text-bg-success">
                            Ledigt
                        </span>

                        <h2 class="h3 mt-3">
                            ${escapeHtml(objekt.rubrik)}
                        </h2>

                        ${
                            objekt.kortText
                                ? `<p class="lead">${escapeHtml(objekt.kortText)}</p>`
                                : ""
                        }

                        ${
                            formatBeskrivning(objekt)
                                ? `<div class="mb-3">${formatBeskrivning(objekt)}</div>`
                                : ""
                        }

                        <p>
                            ${
                                objekt.storlek
                                    ? `<strong>Storlek:</strong> ${escapeHtml(objekt.storlek)}<br>`
                                    : ""
                            }

                            <strong>Hyra:</strong>
                            ${formatHyra(objekt.hyra)}<br>

                            <strong>Läge:</strong>
                            ${escapeHtml(objekt.adress)},
                            ${escapeHtml(objekt.omrade)}<br>

                            <strong>Ledigt från:</strong>
                            ${escapeHtml(formatDatum(objekt.ledigFran))}
                        </p>

                        <div class="d-flex gap-2 flex-wrap">
                            <a class="btn btn-success"
                               href="${skapaIntresseMailto(objekt)}">
                                <i class="bi bi-envelope-fill me-1"></i>
                                Anmäl intresse
                            </a>

                            <a class="btn btn-outline-primary"
                               href="objekt.html?id=${encodeURIComponent(objekt.id)}">
                                Läs mer
                            </a>

                            ${planritningsKnapp(objekt)}
                        </div>
                    </div>
                </div>
            </div>
        </article>
    `;
}

/* =========================================================
   STARTSIDAN
   ========================================================= */

async function initStart() {
    const text = document.querySelector("#ledigt-text");
    const antal = document.querySelector("#antal-lediga");
    const ruta = document.querySelector("#start-ledigt");

    if (!text && !antal && !ruta) return;

    const data = await hamtaData();
    const objekt = ledigaObjekt(data);

    if (antal) {
        antal.textContent = objekt.length;
    }

    if (text) {
        text.textContent =
            objekt.length === 0
                ? "Inga lediga objekt just nu"
                : objekt.length === 1
                    ? "1 ledigt objekt just nu"
                    : `${objekt.length} lediga objekt just nu`;
    }

    if (!ruta) return;

    ruta.innerHTML = objekt.length
        ? `
            <div class="row g-4">
                ${objekt.map(o => `
                    <div class="col-md-6">
                        <div class="card h-100 shadow-sm">
                            <img src="${escapeHtml(
                                bilder(o)[0] ?? "bilder/hero.jpg"
                            )}"
                                 class="card-img-top"
                                 style="height:220px;object-fit:cover"
                                 alt="${escapeHtml(o.rubrik)}">

                            <div class="card-body">
                                <span class="badge bg-success mb-2">
                                    Ledigt
                                </span>

                                <h3 class="h5">
                                    ${escapeHtml(o.rubrik)}
                                </h3>

                                <p>
                                    ${escapeHtml(o.storlek ?? "")}<br>
                                    ${formatHyra(o.hyra)}
                                </p>

                                <div class="d-flex gap-2 flex-wrap">
                                    <a class="btn btn-success"
                                       href="${skapaIntresseMailto(o)}">
                                        <i class="bi bi-envelope-fill me-1"></i>
                                        Anmäl intresse
                                    </a>

                                    <a class="btn btn-outline-primary"
                                       href="objekt.html?id=${encodeURIComponent(o.id)}">
                                        Läs mer
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join("")}
            </div>
        `
        : "";
}

/* =========================================================
   SIDAN LEDIGA
   ========================================================= */

async function initLediga() {
    const behallare = document.querySelector("#lediga-objekt");
    const tomRuta = document.querySelector("#inga-lediga");

    if (!behallare) return;

    const data = await hamtaData();
    const objekt = ledigaObjekt(data);

    if (!objekt.length) {
        tomRuta?.classList.remove("d-none");
        behallare.innerHTML = "";
        return;
    }

    tomRuta?.classList.add("d-none");
    behallare.innerHTML =
        objekt.map(skapaObjektkort).join("");
}

/* =========================================================
   KATEGORISIDOR
   Exempel i HTML:
   <body data-typ="garage">
   ========================================================= */

async function initKategori() {
    const behallare = document.querySelector("#kategori-ledigt");
    const status = document.querySelector("#kategori-status");
    const typ = document.body.dataset.typ;

    if (!behallare || !typ) return;

    const data = await hamtaData();
    const objekt = ledigaObjekt(data, typ);

    if (status) {
        status.innerHTML = objekt.length
            ? '<div class="alert alert-success">Det finns lediga objekt i denna kategori.</div>'
            : '<div class="alert alert-secondary">För närvarande finns inga lediga objekt i denna kategori.</div>';
    }

    behallare.innerHTML =
        objekt.map(skapaObjektkort).join("");
}


function skapaObjektSeoText(objekt) {
    const typNamn = {
        garage: "garage",
        forrad: "förråd",
        lokal: "lokal",
        parkering: "parkeringsplats",
        lagenhet: "lägenhet"
    };

    const typ = typNamn[objekt.typ] || "objekt";
    const plats = objekt.omrade || "Umeå";
    const adress = objekt.adress ? ` på ${objekt.adress}` : "";
    const storlek = objekt.storlek ? ` Objektet är ${objekt.storlek}.` : "";

    const extra = {
        garage: " Det passar dig som vill ha en lättillgänglig och skyddad plats för bilen.",
        forrad: " Det passar för förvaring för både privatpersoner och företag.",
        lokal: " Lokalen passar för mindre verksamhet, kontor eller annan användning enligt överenskommelse.",
        parkering: " Platsen ger smidig parkering med närhet till området.",
        lagenhet: " Här finns information om bostadens storlek, hyra och tillgänglighet."
    };

    return `Detta ${typ} ligger${adress} i ${plats}.${storlek}${extra[objekt.typ] || ""}`;
}

function uppdateraMeta(selector, attribut, varde) {
    let element = document.head.querySelector(selector);

    if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribut[0], attribut[1]);
        document.head.appendChild(element);
    }

    element.setAttribute("content", varde);
}

function uppdateraObjektSeo(objekt, seoText, data) {
    const foretagsnamn = data.foretag?.namn || "Söderman Fastighet";
    const titel = objekt.seo?.title || `${objekt.rubrik} | ${foretagsnamn}`;
    const beskrivning = objekt.seo?.description || seoText;
    const canonicalUrl =
        `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(objekt.id)}`;

    document.title = titel;

    uppdateraMeta('meta[name="description"]', ["name", "description"], beskrivning);
    uppdateraMeta('meta[property="og:title"]', ["property", "og:title"], titel);
    uppdateraMeta('meta[property="og:description"]', ["property", "og:description"], beskrivning);
    uppdateraMeta('meta[property="og:url"]', ["property", "og:url"], canonicalUrl);
    uppdateraMeta('meta[name="twitter:title"]', ["name", "twitter:title"], titel);
    uppdateraMeta('meta[name="twitter:description"]', ["name", "twitter:description"], beskrivning);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const objektbilder = bilder(objekt);
    if (objektbilder.length) {
        const bildUrl = new URL(objektbilder[0], window.location.href).href;
        uppdateraMeta('meta[property="og:image"]', ["property", "og:image"], bildUrl);
        uppdateraMeta('meta[property="og:image:alt"]', ["property", "og:image:alt"], objekt.rubrik);
        uppdateraMeta('meta[name="twitter:image"]', ["name", "twitter:image"], bildUrl);
    }

    const schema = {
        "@context": "https://schema.org",
        "@type": "Offer",
        "name": objekt.rubrik,
        "description": beskrivning,
        "url": canonicalUrl,
        "availability": "https://schema.org/InStock",
        "seller": {
            "@type": "RealEstateAgent",
            "name": foretagsnamn,
            "url": window.location.origin
        },
        "itemOffered": {
            "@type": "Accommodation",
            "name": objekt.rubrik,
            "description": seoText,
            "address": {
                "@type": "PostalAddress",
                "streetAddress": objekt.adress || "",
                "addressLocality": "Umeå",
                "addressCountry": "SE"
            }
        }
    };

    if (objekt.hyra) {
        schema.priceSpecification = {
            "@type": "UnitPriceSpecification",
            "price": objekt.hyra,
            "priceCurrency": "SEK",
            "unitText": "MONTH"
        };
    }

    const schemaElement = document.querySelector("#objekt-schema");
    if (schemaElement) {
        schemaElement.textContent = JSON.stringify(schema);
    }
}

/* =========================================================
   DETALJSIDAN objekt.html?id=...
   ========================================================= */

async function initObjekt() {
    const behallare = document.querySelector("#objekt-detalj");

    if (!behallare) return;

    const id =
        new URLSearchParams(window.location.search).get("id");

    const data = await hamtaData();

    const objekt = (data.objekt ?? []).find(
        o => String(o.id) === String(id)
    );

    if (!objekt || objekt.ledigt !== true) {
        behallare.innerHTML = `
            <div class="alert alert-secondary">
                Objektet är inte längre ledigt.
            </div>
        `;
        return;
    }

    const seoText = objekt.seoText || skapaObjektSeoText(objekt);
    uppdateraObjektSeo(objekt, seoText, data);

    const mailto = skapaIntresseMailto(objekt);

    behallare.innerHTML = `
        <article class="card shadow service-card">
            ${carousel(objekt)}

            <div class="p-4 p-lg-5">
                <h1>${escapeHtml(objekt.rubrik)}</h1>

                ${
                    objekt.kortText
                        ? `<p class="lead">${escapeHtml(objekt.kortText)}</p>`
                        : ""
                }

                ${
                    formatBeskrivning(objekt)
                        ? `<div class="mb-4">${formatBeskrivning(objekt)}</div>`
                        : ""
                }

                <p>
                    ${
                        objekt.storlek
                            ? `<strong>Storlek:</strong> ${escapeHtml(objekt.storlek)}<br>`
                            : ""
                    }

                    <strong>Hyra:</strong>
                    ${formatHyra(objekt.hyra)}<br>

                    <strong>Läge:</strong>
                    ${escapeHtml(objekt.adress)},
                    ${escapeHtml(objekt.omrade)}<br>

                    <strong>Ledigt från:</strong>
                    ${escapeHtml(formatDatum(objekt.ledigFran))}
                </p>

                <section class="mt-4 mb-4" aria-labelledby="om-objektet">
                    <h2 id="om-objektet" class="h4">
                        Om objektet
                    </h2>
                    <p class="mb-0">${escapeHtml(seoText)}</p>
                </section>

                <a class="btn btn-success" href="${mailto}">
                    Anmäl intresse
                </a>

                ${planritningsKnapp(objekt)}
            </div>
        </article>
    `;
}

/* =========================================================
   KONTAKTSIDA
   Valfria element:
   #foretag-namn
   #foretag-adress
   #foretag-stad
   #foretag-epost
   #foretag-telefon
   ========================================================= */

async function initKontakt() {
    const namn = document.querySelector("#foretag-namn");
    const adress = document.querySelector("#foretag-adress");
    const stad = document.querySelector("#foretag-stad");
    const epost = document.querySelector("#foretag-epost");
    const telefon = document.querySelector("#foretag-telefon");

    if (!namn && !adress && !stad && !epost && !telefon) {
        return;
    }

    const data = await hamtaData();
    const foretag = data.foretag ?? {};

    if (namn) namn.textContent = foretag.namn ?? "";
    if (adress) adress.textContent = foretag.adress ?? "";
    if (stad) stad.textContent = foretag.stad ?? "";

    if (epost) {
        const adressText = foretag.epost?.trim() ?? "";
        epost.textContent = adressText;

        if (epost.tagName === "A" && adressText) {
            epost.href = `mailto:${adressText}`;
        }
    }

    if (telefon) {
        const telefonText = foretag.telefon?.trim() ?? "";
        telefon.textContent = telefonText;

        if (telefon.tagName === "A" && telefonText) {
            telefon.href =
                `tel:${telefonText.replace(/[^\d+]/g, "")}`;
        }
    }

    const objektNamn =
        new URLSearchParams(window.location.search).get("objekt");

    const intresseRad = document.getElementById("intresse-rad");
    const intresseObjekt = document.getElementById("intresse-objekt");

    if (objektNamn && intresseRad && intresseObjekt) {
        intresseObjekt.textContent = objektNamn;
        intresseRad.classList.remove("d-none");
    }
}

/* =========================================================
   STARTA ALLT
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
    await Promise.all([
        laddaMeny(),
        laddaFooter()
    ]);

    await Promise.all([
        initStart(),
        initLediga(),
        initKategori(),
        initObjekt(),
        initKontakt()
    ]);
});
