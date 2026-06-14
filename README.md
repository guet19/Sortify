# Projektdokumentation - digitales Kleinteilelager

## Inhaltsverzeichnis

1. [Ausgangslage](#1-ausgangslage)
2. [Lösungsidee](#2-lösungsidee)
3. [Vorgehen & Artefakte](#3-vorgehen--artefakte)
    1. [Understand & Define](#31-understand--define)
    2. [Sketch](#32-sketch)
    3. [Decide](#33-decide)
    4. [Prototype](#34-prototype)
    5. [Validate](#35-validate)
4. [Erweiterungen [Optional]](#4-erweiterungen-optional)
5. [KI-Deklaration](#6-ki-deklaration)


<!-- WICHTIG: DIE KAPITELSTRUKTUR DARF NICHT VERÄNDERT WERDEN! -->

<!-- Diese Vorlage ist für eine README.md im Repository gedacht. Abschnitte mit [Optional] können weggelassen werden, wenn in den Übungen nichts anderes verlangt wird. -->

## 1. Ausgangslage
<!-- Kurz beschreiben, welches Problem adressiert wird und welches Ergebnis angestrebt ist. Wem nützt die Lösung, wer ist beteiligt oder betroffen?-->
### Problem: 
_Die Lagerung von Kleinteilen (Schrauben, Muttern, Elektrotechnikbauteilen usw.) ist in privaten Werkstätten und kleinen Betrieben oft sehr unübersichtlich und eine Herausforderung. Die Suche nach dem passenden Teil kostet viel Zeit und die Lagerhaltung wird oft vernachlässigt, da es von Hand sehr zeitaufwendig (ständig neue Beschriftung der einzelnen Fächer mit Artikelbezeichnung, Zählen des Bestands usw.) und fehleranfällig ist. Dies führt oft zu dem frustrierenden Moment, dass benötigte Teile (z. B. eine spezifische M3-Schraube) genau dann fehlen, wenn sie mitten in einem Projekt dringend benötigt werden. Ebenso führt es zu Fehlkäufen, da man bereits vorhandenes Verbrauchsmaterial zur "Sicherheit" im Baumarkt erneut kauft, obwohl man diese bereits auf Lager hat._
### Ziele:

- Verkürzung der Suchzeit durch  visuelle Führung (Pick-by-Light) und passende Filteroptionen durch Benutzeroberfläche.

- Reduzierung von Fehlkäufen durch transparente Bestandsübersicht, welche über das Internet erreichbar ist.

- Vollständige Automatisierung der Bestandskontrolle nach der Entnahme (z. B. durch sensorgestützte Gewichtsmessung) über GPIO Pins des Raspberry Pi.

- Automatisiertes Errinnerungssystem, das bei Unterschreitung von Mindestbeständen per Mail zum Nachkauf auffordert.

- Verhindern von ständigem kompliziertem Beschriften der Fächer, nach Änderung des Inhalts.

### Primäre Zielgruppe: 
_Heimwerker, Hardware Bastler_  

### Weitere Stakeholder: 
_Kleinbetriebe, Shared-Workspaces, Lieferanten, Baumärkte_  


## 2. Lösungsidee

<img src="./static/images/readme/KI_Picture.png" alt="Beschreibung" width="100%">

Gemini KI-Bild als Veranschaulichung 

### Kernfunktionalität: 
  - **Suchen & Finden:** Nutzer filtern in der SvelteKit-Web-App nach Attributen (z. B. M3-Schraube, 20mm Länge). Nach der Auswahl sendet die App ein Signal an einen Raspberry Pi, der die LED am entsprechenden Fach im Regal aufleuchten lässt (Pick-by-Light).

  - **Automatisierte Bestandsführung:** Nach der Entnahme wird das Fach auf eine mit einem Raspberry Pi verbundene Waage gestellt und der Barcode mit dem Scanner abgescannt (evtl. auch Möglichkeit für einen NFC Chip mit NFC-Leser). Das System berechnet anhand des einzelnen Artikelgewichts, des Leergewichts des Fachs und dem Gesamtgewicht automatisch die Restmenge und aktualisiert den Bestand in der Datenbank.

  - **Intelligente Benachrichtigung:** Das System prüft den Bestand gegen einen hinterlegten Mindestwert. Bei Unterschreitung wird automatisch eine E-Mail mit einem direkten Nachkauf-Link an den Besitzer versendet.

  - **Mobiler Datenzugriff (Projektarbeit):** Da die Anwendung online zugänglich ist, kann der aktuelle Lagerbestand jederzeit von unterwegs (z. B. im Baumarkt) eingesehen werden.
    - **Aufrufen des Inventars** durch Filterung nach Kategorien und Unterkategorien sowie Suchfeld inkl. Detailanzeige.

    - **Bestellen**

      
      > **Notiz 03.06.26: Aufgrund Projektumfang nicht umgesetzt**
      >
      > Filterung der Artikel nach diversen Kriterien (z.B. Bestand) und erstellen einer Bestellliste. 
      > 
      > Möglichkeit um Artikel als bestellt zu vermerken, damit diese auf der "In Bestellung" Liste angezeigt werden und Informationen wie "In Bestellung" + "Bestellmenge", "Bestellstatus" und "Bestelldatum" in der Datenbank hinterlegt werden und die Infos auf der Produktseite angezeigt werden.

    - **In Bestellung**

    
      > **Notiz 03.06.26: Aufgrund Projektumfang nicht umgesetzt**
      >
      > Anzeige der ausstehenden Lieferungen, Bestätigung nach Erhalt inkl. Aktualisierung des Bestands (Anpassung der Bestellmenge möglich)

    - **Kategorien verwalten** Verwalten der Attribute (Filtermöglichkeiten) je Kategorie, Attribute können pro Kategorie hinzugefügt, bearbeitet und gelöscht werden. Diese dienen dann als Vorlage für "Artikel hinzufügen" und werden für die Filteroptionen verwendet.

    - **Artikel hinzufügen** Auswahl der Kategorie, Bildimport, Angabe der Artikeldetails/Spezifikationen, EAN/GTIN, Angabe des Mindestbestands, Angabe des Bestelllinks.

      
      > **Abgrenzung:**
      > (Angabe des Lagerfachs), (Angabe des Gewichts pro Stück), (Angabe des Fach Nettogewichts)

    - **KI-Artikelerfassung** Artikel können einfach per KI von einer Webseite eingelesen und erfasst werden. 
    
    
### Annahmen: 
- _Die visuelle Führung mittels LEDs reduziert die Suchzeit im Vergleich zu herkömmlichen Beschriftungen signifikant._
- _Die automatisierte Bestandsführung mittels Waage ist präzise genug, um die Bestandsmenge zuverlässig zu erfassen._

### Abgrenzung: 
  - Innerhalb des Projekts wird nur die Software für die Webanwendung für den mobilen Datenzugriff auf den Lagerbestand entwickelt. Die weiteren technischen Komponenten wie die Hardware (Raspberry Pi, Waage, LEDs, Scanner), sowie die Software für den Raspberry PI zum Hinzufügen und Entfernen von Artikeln werden innerhalb dieses Projekts nicht entwickelt.



## 3. Vorgehen & Artefakte
Die Durchführung des Projekts erfolgte entlang der vorgegebenen Phasen (Understand/Define, Sketch, Decide, Prototype, Validate).

### 3.1 Understand & Define
 **Zielgruppenverständnis:**
  - **Zielgruppe:** Die primäre Zielgruppe umfasst zu Beginn Privatpersonen und kleine Einzelunternehmen innerhalb der Deutschschweiz, budgetorientierte Personen, Interesse an besserer Lagerhaltung (Kleinteile)
  - **Problemraum:** In Werkstätten, Hobby-Kellern oder kleinen Betrieben herrscht oft Unordnung bei Kleinteilen (Schrauben, Elektronikbauteile). Das Suchen nach dem exakt passenden Teil (z.B. M3 vs. M4 Schraube) kostet Zeit. Zudem ist die manuelle Bestandskontrolle fehleranfällig und aufwendig, was oft dazu führt, dass wichtige Teile genau dann fehlen, wenn man sie dringend braucht oder erneut gekauft werden, obwohl diese noch vorhanden sind.

    - Nutzer:
      - Heimwerker
      - Hardware-Bastler
      - Kleinunternehmen

    - Bedürfnisse:
      - Schnelles Finden von Bauteilen
      - Automatisierte Bestandeskontrolle
      - Mobiler Inventarzugriff
      - Ausreichend Bestand
      -	keine Fehlkäufe

    - Herausforderungen:
      - Kleinteile sind optisch teilweise schwer unterscheidbar
      - Anzahl an Kleinteilen
      - Grosser Aufwand für Bestandpflege
      - Artikelwechsel

    - Zur Fokussierung des Problemraums wurden folgende *How-Might-We-Fragen (HMW)* formuliert
      - Wie könnten wir den Such- und Entnahmeprozess von Kleinteilen so digitalisieren, dass das System den Nutzer visuell oder über smarte Filter direkt zum richtigen Artikel führt?
      - Wie könnten wir die Bestandsaktualisierung und Erfassung von Artikeln so reibungslos gestalten, dass der manuelle Tippaufwand möglichst gering ist?
      -	Wie können Fehlkäufe des Nutzers vermieden und zu wenig Bestand verhindert werden?

  
**Existierende Lösungen:** 
  - **Privatkunden/Kleinbetriebe:**  Für Privatkunden/Kleinbetriebe beschränken sich meist auf analoge Sortimentskästen mit unleserlichen Etiketten oder unübersichtliche Excel-Listen.   Die grösste Hürde bestehender Vorrats- oder Inventar-Apps liegt in der mangelhaften Usability, da jedes Produkt zeitaufwendig händisch eingetippt werden muss. Trotz Recherche in Arduino, RaspberryPi, Hackster.io, Instractables Foren, konnte ich keine fertige passende Lösung zum Eigenbau für Privatanwender und kleinere Betriebe finden. Fertige Lösungen, welche die Anforderungen erfüllen und kommerziell erworben werden können, sind ebenfalls nicht vorhanden.

  - **Firmenlösungen:** 
Professionelle Systeme aus der Grossindustrie (wie teure Pick-by-Light- oder RFID-Anlagen) sind für Privatanwender und Kleinbetriebe finanziell zu kostenintensiv. Diese Industrie Pick by Light Optionen werden von diversen Firmen wie [Luca Logistic Solution](https://www.luca.eu/pick-by-light/), [Captron](https://captron-solutions.com/en), [Schäfer](https://www.ssi-schaefer.com/de-de/produkte/kommissionierung-handling/manuelle-kommissionierung/pick-by-light) angeboten. 

**Wesentliche Erkenntnisse:**
  - Es wird eine bezahlbare, intuitive und webbasierte Lösung (Web-App) für Privatkunden/Kleinbetriebe benötigt, die den Fokus komplett auf Erfassungsgeschwindigkeit und flexible Strukturierung legt. Die manuelle Dateneingabe muss durch Automatisierung (Schnittstellen, KI) auf ein absolutes Minimum reduziert werden. Der Aufbau/Konfiguration der Lösung sollte möglichst einfach gestaltet werden. Ebenso sollte das Einsatzgebiet flexibel sein. 



### 3.2 Sketch
 **Variantenüberblick:** Um Lösungsansätze für die Hauptfunktion, also die intuitive Suchmaske und die Artikelfilterung zu sammeln, wurde die Kreativitätsmethode *Crazy 8s* angewendet.
 
<img src="./static/images/readme/Crazy_8s_1.png" alt="Beschreibung" width="100%">

<img src="./static/images/readme/Crazy_8s_2.png" alt="Beschreibung" width="100%">

 **Kommentare von Simeon und Samet zu den verschiedenen Varianten (ausserhalb Unterricht):**
  - **Positiv:** Am besten wurde die Variante unten links auf dem ersten Bild bewertet, da diese laut den beiden Kommentaren, die beste Bedienerfreundlichkeit und Anpassungsmöglichkeit mit Filtern, Suchen sowie Produktübersicht bietet. 
  - **Negativ:** Am schlechtesten wurden die ersten Varianten auf Bild 1 und Bild 2 bewertet, da diese die Suche zeitintensiv gestaltet und somit die Benutzerfreundlichkeit stark leidet. Ebenfalls wurden andere Versionen als unübersichtlich, überfüllt oder schwer zu konfigurieren bewertet.

 **Skizzen:** 
  - Am Ende entschied ich mich für den Favoriten von Simeon und Samet. Die Entscheidung fiel mir einfach, da ich von Anfang an überzeugt war, dass dies die beste Möglichkeit ist, um möglichst viele Funktionen einzufügen, die Benutzerfreundlichkeit zu gewährleisten und das Layout nicht als zu überfüllt wirken zu lassen. Im unteren Bild ist die weiter ausgearbeitete Skizze der Hauptfunktion.


  <img src="./static/images/readme/Skizze.jpg" alt="Beschreibung" width="100%">


### 3.3 Decide
**Gewählte Variante & Begründung:** Wie zuvor beschrieben, fiel die Wahl auf die *Kachelstruktur mit dynamischer Filter-Sidebar*. Als primäre Entscheidungskriterien galten eine hervorragende visuelle Übersicht (großzügige Artikelkarten mit Bildern) bei gleichzeitig maximaler Flexibilität für komplexe, filterbare Produktattribute. Ebenfalls ist die Option auch gut für die Mobileansicht umsetzbar, indem man die Filteroption mit einem Button einblenden lässt.

**End-to-End-Ablauf:** Unten aufgeführt sind die User-Journey Maps, welche diverse Abläufe darstellen, wie der Benutzer ein Ziel erreichen/ausführen kann.

  <img src="./static/images/readme/User-Journey Maps 1.png" alt="Beschreibung" width="100%">
    <img src="./static/images/readme/User-Journey Maps 2.png" alt="Beschreibung" width="100%">
      <img src="./static/images/readme/User-Journey Maps 3.png" alt="Beschreibung" width="100%">
   
**Designentscheide:**
  - **Navigation/Filterung:**
      Zuerst wird die Überkategorie (z. B. Befestigungen) gewählt, erst dann
      erscheinen die Unterkategorien (z. B. Schrauben), woraufhin sich die
      spezifischen Filterattribute (Gewinde, Länge) aufbauen.
  - **Kategorien/Filter definieren:** 
      Die Kategorien und Filter können dynamisch vom Nutzer selbst bestimmt
      werden. Als erstes werden Filtermöglichkeiten definiert. Danach
      Überkategorien und dazugehörige Unterkategorien. Innerhalb der
      Unterkategorien können Filtermöglichkeiten zugewiesen werden.
  - **Platzierung Kategorien/Filter in den Einstellungen:**
      Da diese Optionen im Normalfall nicht häufig geändert werden, sondern nur
      beim Anlegen von komplett neuen Kategorien, wurden diese Optionen im
      Einstellungen Abschnitt platziert.
    

**Mockup:** 
  - Link zum Prototypen:
    https://www.figma.com/proto/Bv7uJOaS5GjZAT6rVyZ3Qj/Prototyp-Sortify?node-id=0-1&t=FTQ6TIcoduSXLCbk-1
  - Link zum Dev-Mode:
    https://www.figma.com/design/Bv7uJOaS5GjZAT6rVyZ3Qj/Prototyp-Sortify?nodeid=0-1&m=dev&t=krpx4ypUo2Ntb0ka-1

### 3.4 Prototype

#### 3.4.1. Entwurf (Design)

- **Informationsarchitektur:** Für die Informationsarchitektur entschied ich mich als Hauptmenü direkt die Inventarübersicht zu nutzen. Diese Seite wird für das Abrufen von Artikeln mit Hilfsfunktionen wie Filter und einer Suche genutzt (grösster Teil der Nutzung). Ebenfalls ist über die Startseite die "Artikel hinzufügen" Option erreichbar (zweitgrösster Teil der Nutzung). Zusätzlich entschied ich mich für einen Abschnitt in der Navigationsleiste mit dem Namen "Kategorien/Filter verwalten", welche die Option bietet um selbst Haupt- sowie Unterkategorien anzulegen. Ebenfalls kann man den Kategorien eigene Filteroptionen hinzufügen.

- **User Interface Design:** 
  - Die Startseite fungiert als zentrales Dashboard für das Inventar. Der Bildschirm ist funktional in drei Kernbereiche unterteilt: die globale Such- und Kategorieleiste (Top-Bar), die spezifische Filter-Sidebar (noch nicht umgesetzt) und die Artikelanzeige im Hauptbereich. Die Navigation bleibt durch eine schlanke Navbar im oberen Bereich jederzeit zugänglich.
  - Das User Interface wird am Ende auf allen Seiten möglichst identisch erscheinen. Aufgrund des Namens "Sortify", welcher einige User an "Spotify" erinnert, wird das Logo grün dargestellt. Die Benutzeroberfläche wird konstrastreich(weiss auf dunkelblauem Hintergrund mit schwarzer Schriftfarbe und grünen Akzenten) gestalltet. Wichtige Bottons werden hellblau dargestellt und Warnungen werden rot dargestellt (Bsp. Bestand niederig)

  <img src="./static/images/readme/Prototyp.png" alt="Beschreibung" width="100%">

 
- **Designentscheidungen:** 
  - Dynamische Formularfelder: Da ein universelles Inventarsystem für eine Schraube andere Spezifikationen erfordert (Länge, Gewinde) als für Tierfutter (Geschmack, MHD), rendert das UI die Eingabemasken und Filter-Sidebars komplett dynamisch auf Basis der in den Einstellungen definierten Attributstrukturen(Filteroptionen) einer Unterkategorie, welche in der MongoDB Datenbank gespeichert werden.
  - Umsetzung der oben definierten Skizze aufgrund Umsetzungsmöglichkeiten und Benefits wie Filtermöglichkeiten, Übersichtlichkeit und Kompatibilität mit Smartphones.

  <img src="./static/images/readme/Filteroptions_Mongo_DB.png" alt="Beschreibung" width="100%">

#### 3.4.2. Umsetzung (Technik)
 **Technologie-Stack:** 
  - [Svelte-Kit](https://svelte.dev/docs/kit/introduction): Full-Stack Framework für Frontend und serverseitiges Backend/API
  - Textdatenbank: [MongoDB](https://www.npmjs.com/package/mongodb) als NOSQL Datenbank
  - Bilddatenbank: Um die MongoDB Datenbank zu entlasten und die Anforderungen wie Payload von maximal 6MB von Netlify und die maximale Dokumentlimite von 16MB von MongoDB einzuhalten wurden die Bilddaten auf [Cloudinary](cloudinary) gespeichert und in der MongoDB verknüpft. 
  - Künstliche Intelligenz: Integration von Google Gemini 2.5 Flash mit dem Modul [@google/genai](https://www.npmjs.com/package/@google/genai) um Artikel unterstützt mit Hilfe von KI anzulegen.
  - Passwort-Hashing: Einbinden von [bcryptjs](https://www.npmjs.com/package/bcryptjs) um die Passwörter als Hash zu speichern.
  - Authentifizierung: Einbinden des Moduls [crypto](https://nodejs.org/api/crypto.html) um sichere Session- und Reset Tokens zu generieren.
  - Bildbearbeitung: Modul [cropper.js](https://fengyuanchen.github.io/cropperjs/) um beim Artikelimport die Bilder zuzuschneiden und direkt zu komprimieren.
  - Datenextraktion: Um die Datenmenge vor dem Übergeben der Webseitdaten an Gemini zu bereinigen, wurde das Modul [Cheerio](https://cheerio.js.org/docs/intro/) verwendet um die unnötigen Daten zu entfernen.
  - SMTP-Mailanbinding: Integration des Moduls [nodemailer](https://www.npmjs.com/package/nodemailer) um User per E-Mail zu verifizieren und eine Möglichkeit zur Passwortrücksetzung zu bieten.

**Tooling:** 
  - Versionskontrolle: GitHub
  erreichbar unter: https://github.com/guet19/smart_inventory_management

**Struktur & Komponenten:**

Die Anwendung trennt strikt zwischen öffentlichen Bereichen und geschützten Bereichen, dafür wurde die (protected) Funktion von Svelte genutzt. Um in den geschützten Bereich zu gelangen, muss der Benutzer sich registrieren und mit dem Konto anmelden.

  - Öffentliche Bereiche (GUI ersichtlich):
    - Login (Startseite, wenn nicht angemeldet)
    - Registrieren
    - Passwort vergessen
    - Tools (für Lesezeichen KI-Import(siehe Erweiterungen))

  - Öffentliche Bereiche (GUI nicht direkt ersichtlich, über Link per Mail)
    - Verifizieren
    - Logout (wenn angemeldet)
    - Passwort zurücksetzen 

  - Geschützte Bereiche:
    - Inventar anzeigen (Startseite, wenn angemeldet)
    - Artikel anzeigen
    - Artikel bearbeiten
    - Artikel hinzufügen
    - Kategorien verwalten
    - Filter verwalten
    - Profil verwalten


  - Wichtige Komponenten:
    - Dynamischer Aufbau der Inventarseite inkl. den Filtern, welche durch die in der Filter/Kategorieverwaltung festgelegten Definitionen und den angelegten Artikel angepasst aufgebaut werden.
    - Dynamischer Aufbau der Spezifikationsabfrage nach Definition des Unterkategoriebereichs beim Hinzufügen eines neuen Artikels.
    - Individuell anpassbare Haupt- und Unterkategorien, welche mit Filtern versehen werden können.
    - Individuell anpassbare Filtermöglichkeiten, welche als Text, Zahl oder Dropdown konfiguriert und bei letzterem mit Werten versehen werden um Duplikate zu vermeiden.
  
 **Daten & Schnittstellen:**
  Die Textdaten werden in MongoDB gespeichert. Bilddaten werden in Cloudinary gespeichert und in MongoDB verlinkt. Alle Datenbankabfragen werden über db.js verwaltet, dies ermöglicht einen besseren Überblick und unterstützt spätere Systenänderungen. Das Frontend kommuniziert mit dem Svelte Kit Routen (+page.server.js) mit der db.js. Somit hat das Frontend und die Routen keinen direkten Datenbankzugriff.

  Durch die Mandantenfähigkeit wird ebenfalls bei jedem Schreib- und Lesevorgang die userId mit Hilfe des HTTP-Cookie des Users überprüft.

  Die Daten in MongoDB werden in folgende Collections unterteilt:

  - **articles:** 
  Beinhaltet die Produktdaten, Bildlink zu Cloudinary, Erfassungs-/Updatezeit sowie den zugehörigen User.

  <img src="./static/images/readme/articles.png" alt="Beschreibung" width="100%">

  - **categories:**
  Beinhaltet die Hauptkategorien mit den zugehörigen Unterkategorien (inkl. Filteroptionen) Erfassungszeit sowie den zugehörigen User.

  <img src="./static/images/readme/categories.png" alt="Beschreibung" width="100%">

  - **filter_attributes:**
  Beinhaltet die Filteroptionen mit den zugehörigen Auswahloptionen, Einheit, ui_type (Zahl, Text, Dropdown) sowie den zugehörigen User.

  <img src="./static/images/readme/filter_attributes.png" alt="Beschreibung" width="100%">

  - **loginAttempts:**
  Zeichnet bei einer fehlerhaften Login Eingabe die externe IP-Adresse auf. Bei 5 Fehlversuchen wird der Login für 5 Minuten blockiert. Sobald korrekt eingeloggt wird, wird die Protokollierung gelöscht.

  <img src="./static/images/readme/loginAttempts.png" alt="Beschreibung" width="100%">

  - **sessionLogs:**
  Zeichnet die Sessions der einzelnen User auf, indem die UserId, E-Mail, Login Zeit und Logout Zeit (insofern ausgeloggt wird) gespeichert wird. Die Daten werden nach 3 Tagen durch einen definierten Prozess in Mongo DB automatisch gelöscht. 

  <img src="./static/images/readme/sessionLogs.png" alt="Beschreibung" width="100%">
  
  - **users:**
  Beinhaltet die verschiedenen Benutzer, welche sich registriert haben inkl. E-Mail, Passwort (gehasht), Vorname, Nachname, Land (optional), Geburtsdatum (optional), Erstellungsdatum und Verifizierungsstatus.
  Wenn ein Nutzer sich neu registriert, wird hier ebenfalls der Verifizierungscode und der Ablaufzeitpunkt des Verifizierungscodes gespeichert.

  <img src="./static/images/readme/users.png" alt="Beschreibung" width="100%">



- **Deployment:** https://sortify-inventory-management.netlify.app

- **Besondere Entscheidungen:** 
  - Für die Verifizierung wurde ein normales GMail Konto angefügt und keine eigene Domain erstellt.


### 3.5 Validate
- **Bilder der getesteten Version**

    <img src="./static/images/readme/Validation_1.png" alt="Beschreibung" width="100%">

    <img src="./static/images/readme/Validation_2.png" alt="Beschreibung" width="100%">

    <img src="./static/images/readme/Validation_3.png" alt="Beschreibung" width="100%">

    <img src="./static/images/readme/Validation_4.png" alt="Beschreibung" width="100%">

    <img src="./static/images/readme/Validation_5.png" alt="Beschreibung" width="100%">


- **Ziele der Prüfung:** 
  - Überprüfung der Usability bei administrativen Aufgaben (Erstellen von Kategorien und zweistufigen Filter-Attributen). 
  - Zudem sollte der zeitliche Aufwand der manuellen Artikelerfassung mit der KI-gestützten Lesezeichen Erfassung verglichen werden. 
  - Zuletzt wurde die Effizienz und Benutzerfreundlichkeit der Such- und Filterfunktionen (Auffinden eines spezifischen Artikels) validiert. 

- **Vorgehen:** 
  - Moderiertes Usability-Testing
  - Führung durch die Aufgaben, Testperson denkt laut mit ("Think Aloud"-Methode)

- **Stichprobe:** 
  - Total: 3 Testpersonen
  - 2 Personen: Mitschüler, Studiengang Wirtschaftsinformatik, Alter: 20-30 Jahre, technikaffine Anwender
  - 1 Person: Freundin, Arbeitet im ERP Bereich (SAP),  Alter: 27 Jahre

- **Aufgaben/Szenarien:** 
  - **Ausgangslage:** 
  Sie verwalten ein digitales Kleinteilelager und möchten künftig auch elektronische Bauteile strukturiert erfassen.
  
    1. **Kategorie anlegen:** Sie möchten in Zukunft auch elektronische Widerstände in Ihr System aufnehmen. Erweitern Sie dafür die bestehende Hauptkategorie «Elektrotechnik» um eine neue Untergliederung namens «Widerstand».
      2. **Attribute definieren:** Damit Sie die Widerstände später präzise filtern können, sollen bei der Erfassung spezifische Angaben zwingend möglich sein: 'Widerstandswert', 'Marke' und 'Nennleistung'. Die Eigenschaft 'Nennleistung' (mit der Einheit 'W' und als reine Zahleneingabe) existiert in Ihrem Lager bisher noch nicht. Richten Sie das System so ein, dass alle drei genannten Eigenschaften für die neue Gruppe «Widerstand» zur Verfügung stehen.
      3. **Manueller Import:** Sie haben im Online-Shop folgenden Artikel gefunden (https://www.jumbo.ch/de/maschinen-werkstatt/kleineisenwaren/schrauben/spanplattenschrauben/ayce-senkkopf-schraube-m4/p/6928328?tt=X1NFUF9mMGJjZjhiNDNjNDcxZjhhOWM0NWY2NjJkNjgwMTljZl9QT1NfMQ==), welchen Sie in Ihr Inventar aufnehmen möchten. Bitte überführen Sie die Produktdaten und Spezifikationen dieses Artikels in Ihr digitales Lager, legen Sie ein passendes Produktbild fest und speichern Sie den Artikel ab.
      4. **KI-Import:** Nun erhalten Sie erneut die selbe Aufgabe, jedoch mit einem anderen Artikel. (https://www.jumbo.ch/de/maschinen-werkstatt/kleineisenwaren/schrauben/spanplattenschrauben/ayce-senkkopf-schraube--m6--80-mm/p/6928237?tt=X1NFUF8xYmVmZTFlZDkyODk0NWI3ODAzNmVjYTc3OGNjMmE4ZV9QT1NfNQ==) Fügen Sie diesen mit Hilfe des installierbaren Lesezeichens dem Lager hinzu.
      5. **Bestandsprüfung:** Sie befinden sich im Baumarkt und sind sich nicht sicher, ob Sie noch Schrauben in der Länge von 60mm vorhanden haben. Sie überprüfen dies mit der Filterfunktion.

- **Kennzahlen & Beobachtungen:** 
  - **Kategorien/Filter anlegen (Aufgabe 1 & 2):** Die Navigation wurde als logisch und schnell empfunden.
    - **Identifizierte Issues:** 
      - Der zweistufige Prozess beim Anlegen von Attributen (erst erstellen, dann zuweisen) wurde von den Testern als sinnvoll erachtet, um Duplikate zu vermeiden, ist jedoch bei der ersten Anwendung ein wenig kompliziert. Ebenfalls war es aufgrund des Aufbaus der Benutzeroberfläche ein wenig umständlich.
      - Es wurde gewünscht, dass nach dem Anlegen einer Hauptkategorie diese automatisch geöffnet wird und man zu dem Bereich zum Anlegen einer Unterkategorie gelangt, ohne diese manuell anzuwählen.
  - **Import-Prozesse (Aufgabe 3 & 4):** Das manuelle Übertragen funktionierte sehr gut (inkl. Bildzuschnitt), wurde aber als sehr langwierig empfunden. Die Erfassungsdauer mit dem KI-Lesezeichen benötigte geschätzt etwa nur 1/5 der Zeit, welchen die manuelle Erfassung benötigt hätte.
    - **Identifizierte Issues:** 
      - Der KI-Import über das Bookmarklet begeisterte, jedoch kam es zu Unsicherheiten ("KI reagiert am Anfang nicht direkt" / Verzögerung ohne visuelles Feedback). 
      - Bei der Erfassung wurde festgestellt, dass man auch auf Hauptkategorien Artikel hinzufügen kann (ohne Auswahl Unterkategorie), obwohl dies nicht mögich sein soll.
  - **Filterung (Aufgabe 5):** Die Suche nach der 60mm-Schraube erfolgte sehr schnell und ohne Probleme.
    - **Identifizierte Issues:** 
      - Die Funktion zum Löschen von Filtern war unklar beschriftet. Testpersonen wünschten sich eine direkte Bestandsanzeige neben dem Filterergebnis. 

- **Zusammenfassung der Resultate:** 
Die Evaluation bestätigte, dass die Grundarchitektur von Sortify logisch aufgebaut ist und die dynamische Filterung eine extrem schnelle Artikelsuche ermöglicht. Sehr vorteilhaft aus Nutzersicht ist der KI-gestützte Import über das Lesezeichen, welcher die Erfassungsdauer auf ein Fünftel der manuellen Eingabezeit reduziert. Dennoch zeigten sich bei Erstanwendern leichte Einstiegshürden, die primär durch fehlendes visuelles Feedback während der KI-Ladezeit sowie kleinere Logikfehler bei der Kategoriezuweisung verursacht wurden.  
- **Abgeleitete Verbesserungen:** 
  - **Priorität 4 (Usability "Katastrophe" / Release-Blocker):** 
    - *Fehlerhafte Kategoriezuweisung beheben.* Es muss technisch zwingend unterbunden werden, dass Artikel direkt einer Hauptkategorie zugewiesen werden können, da dies die mandantenfähige Datenbankarchitektur und die Logik der dynamischen Filter bricht.
    - *Leere Zustände:* Hauptkategorien ohne vorhandene Unterkategorien sollen im Dropdownmenü auf der Inventarseite ausgeblendet werden, da diese für grosse Verwirrung sorgen, wenn man diese auswählen kann und danach keine Artikel angezeigt werden. Das selbe gilt für Artikel hinzufügen, wobei man eine Hauptkategorie anwählen kann und danach keine Unterkategorie erscheint.

  - **Priorität 3 (Grosses Problem / Hohe Priorität):** *Visuelles Feedback beim KI-Import.* Ein Ladeindikator (z. B. Spinner oder Progress Bar) muss beim Auslösen des Bookmarklets implementiert werden. Das aktuelle Fehlen von Feedback führt zu grosser Verunsicherung und potenziellen Mehrfach-Ausführungen durch die Nutzer.
  - **Priorität 2 (Kleines Problem / Tiefe Priorität):** 
    - *UX-Writing anpassen:* Beschriftung des Löschen-Buttons im administrativen Filterbereich von "Löschen" zu "Filter löschen" präzisieren, um Missverständnisse zu minimieren.
    - *Klickpfade verkürzen:* Neu erstellte Hauptkategorien sollen nach dem Speichern automatisch im UI aufklappen, um den Weg zur notwendigen Erstellung der Unterkategorie zu beschleunigen.
    - *Informationsarchitektur optimieren:* Direkte Anzeige des aktuellen Lagerbestands direkt auf in der Inventarübersicht, damit Nutzer für diese Kerninformation nicht in die Detailansicht wechseln müssen.
## 4. Erweiterungen
Dokumentiert Erweiterungen über den Mindestumfang hinaus.

### 4.1 KI-gestützter Artikel-Import (Bookmarklet & Google Gemini)
- **Beschreibung & Nutzen:** Die manuelle Dateneingabe ist der grösste "Pain Point" bei Inventar-Systemen. Um dies zu lösen, wurde ein externes Browser-Lesezeichen entwickelt, das Nutzer in beliebigen Online-Shops (z. B. Galaxus, Jumbo) anklicken können. Dieses kann auf der Webseite unter Tools in das Lesezeichenmenü gezogen werden. Es extrahiert versteckte Strukturdaten (JSON-LD) sowie Seitentexte und leitet auf die Sortifiy Artikel hinzufügen Webseite, danach sendet dieses die Daten an das Sortify-Backend und Cheerio bereinigt einen Teil der Daten. Danach übernimmt die Google Gemini KI, bereinigt die restlichen Daten, verfasst saubere Beschreibungen, liest Metadaten wie EAN/GTIN aus und berechnet durch die Packungseinheit und den Verkaufspreis automatisch die Gesamtstückzahl. Dies reduziert die Erfassungsdauer erheblich, wie dies in der Evalutation bestätigt wurde.

  - **Probleme:** Zu Beginn war ein einfaches Einfügen des Links geplant, jedoch musste ich später feststellen, dass einige Webseiten den Zugriff blockieren und somit das Auslesen der Daten nicht möglich war, deshalb wurde auf das Lesezeichen umgestiegen, welches die Daten ausliest. Nach dem Deploy musste ich feststellen, dass das Lesezeichen nicht mehr so gut funktioniert, da Netlify die URL ab einer gewissen Zeichenlänge kürzt und somit die Daten verloren gehen, weshalb das Lesezeichen mit dem JavaScript Code erneut angepasst werden musste.

- **Wo umgesetzt:**
  - **Frontend:** JavaScript-Lesezeichen zur clientseitigen Datenextraktion im Shop.
  - **Backend:** SvelteKit API-Route für den Empfang des Payloads und die direkte Anbindung an die Google Generative AI (gemini-2.5-flash).
  - **Datenbank:** MongoDB zur Speicherung der KI-generierten Datensätze.

- **Referenz:** Technische Umsetzung in Kap. 3.4.2.

- **Aus Evaluation abgeleitet?**
  - Teilweise. Dieses Feature wurde von Beginn an konzipiert, jedoch wurden einige Verbesserungsvorschläge in Bezug auf die Bedienung, wie Ladebalken umgesetzt.

### 4.2 Multi-Tenant-Architektur & Custom Security Lifecycle
- **Beschreibung & Nutzen:** Um das unberechtigte Ändern von Daten zu unterbinden und das getrennte Anlegen und Nutzen von Artikel, Filtern und dem Inventar für verschiedene User zu ermöglichen, wurde ein vollständig serverseitiges Authentifizierungssystem für eine Mandantenarchitektur eingebaut. Mehrere Nutzer können das System parallel verwenden, wobei ihre Inventardaten strikt voneinander isoliert sind. Das System beinhaltet E-Mail-Verifizierung (Anbindung einer Gmail Mailadresse über nodemailer) via Tokens, zeitlich begrenzte Passwort-Reset-Links, Speicherung des Login Zugangs mit Cookie und IP-basiertes Rate-Limiting als Schutz vor Brute-Force-Angriffen. 

- **Wo umgesetzt:**
  - **Frontend:** Login, Logout, Register, Reset-Password in SvelteKit.
  - **Backend:** SvelteKit Server.js Konfiguration und Form-Actions. Einsatz von bcryptjs für Passwort-Hashing und dem Node.js crypto-Modul für sichere Token-Generierung. Einbinden von nodemailer um Mail über verify-sortify@gmail.com zu versenden.
  - **Datenbank:** MongoDB-Collections für User, SessionLogs und fehlgeschlagene Anmeldeversuche.

- **Referenz:** Technische Umsetzung in Kap. 3.4.2 und im Bereich Daten und Schnittstellen.
- **Aus Evaluation abgeleitet?** Nein. Die Nutzung mit mehreren Nutzern wurde gegen Ende des Projekts beschlossen.

### 4.3 Clientseitige Bildverarbeitung
- **Beschreibung & Nutzen:** Um das Layout des digitalen Lagers nicht durch inkonsistente Bildformate zu zerschiessen, wurde eine Lösung für Produktbilder benötigt. Anstatt Bilder roh hochzuladen, wurde ein Editor integriert, der es Nutzern erlaubt, hochgeladene oder via Web importierte Bilder direkt im Browser zuzuschneiden und ein einheitliches 4:3-Format zu erzwingen. Vor dem Senden an den Server, werden diese zusätzlich komprimiert.

- **Wo umgesetzt:**
  - **Frontend:** Einbindung und Konfiguration der Bibliothek Cropper.js innerhalb der Svelte-Komponenten für die Artikelerfassung.
  - **Backend:** SvelteKit Form-Actions nehmen den Zuschnitt entgegen, konvertieren diesen in einen Buffer und laden ihn Serverseitig direkt auf Cloudinary hoch.
  - **Datenbank:** MongoDB speichert nicht die Bilddatei, sondern lediglich die von Cloudinary generierte Bild-URL als referenziertes Feld im jeweiligen Artikel-Dokument.

- **Referenz**  Bereich technische Umsetzung in Kap. 3.4.2.

- **Aus Evaluation abgeleitet?:** Nein. Wurde zur Sicherstellung der Konsistenz vorab entwickelt.

### 4.3 Visuelles Feedback (Ladeindikator) für den KI-Import
- **Beschreibung & Nutzen:** 
  Beim Auslösen des KI-gestützten Imports über das Lesezeichen vergingen einige Sekunden aufgrund der Gemini API-Verarbeitung, ohne dass die Benutzeroberfläche reagierte. Durch die Implementierung eines Ladeindikators weiss der Nutzer nun visuell, dass das System die Daten gerade  verarbeitet. Dies verhindert Verunsicherung und potenziell fehlerhafte Mehrfachklicks auf den Import-Button.

- **Wo umgesetzt:**
  - **Frontend:** Loading Spinner, welcher während des Fetch-Requests ans Backend eingeblendet wird und die Eingabefelder rendert.
  - **Backend:** In diesem Fall findet kein Datenbankänderung statt, solange es nicht gespeichert wird.

- **Referenz:** Beobachtungen in Kap. 3.5 (Identifizierte Issues bei Aufgabe 3 & 4).

- **Aus Evaluation abgeleitet?** Ja. Diese Erweiterung ist eine direkte Lösung für das im Usability-Test identifizierte Problem mit Priorität 3.

## 5. KI-Deklaration

### 5.1 KI-Tools
- **Eingesetzte Tools**: Gemini 3.1 Pro (erweiterter Denkaufwand), externe Nutzung ohne Einbindung in VSCode.
- **Zweck & Umfang**: 
  - Zu Beginn wurde genau überlegt, was die Anforderungen sind und wie ein möglichst anpassbares, erweiterbares und übersichtliches System erschaffen werden muss. Nach dem Festlegen der unter Kapitel Struktur & Komponenten (geschützte Bereiche, ohne Profilverwaltung) definierten Seiten wurde der Grundaufbau (Seiten, Anbindung an die MongoDB Datenbank, Navigation, Ordnerstruktur) manuell angelegt. Aufgrund der Effizienz und dem fehlenden Know How wurde nach dem Grundaufbau für das gesamte Projekt KI genutzt um die definierten Wünsche umzusetzen, dabei entstanden immer weitere gewünschte Verbesserungen und Probleme, welche behoben werden mussten. Teilweise wurden einige kleine Änderungen in Bezug auf das Layout manuell durchgeführt, jedoch ist der grösste Teil des Codes komplett durch KI entstanden.

  - Für die Erarbeitung der README.md Datei wurde KI zur Strukturierung und Ideenfindung genutzt, jedoch wurde ein grosser Teil manuell geschrieben und übernommene Teile durch die KI wurden umgeschrieben.

- **Eigene Leistung (Abgrenzung):**
  - Strukturierung und Überlegung der gesamten Idee des Projekts
  - Erstellen des MongoDB Clusters, Datenbank und den zugehörigen Collections.
  - Einrichten der Datenlöschung nach 3 Tagen für die Collection loginAttempts und sessionLogs
  - Grundaufbau und Anbindung des Projekts (siehe Beschreibung vorheriger Abschnitt)
  - Erarbeitung des schriftlichen Teils (siehe oben)
  - Überlegung der Verbesserungen und Fehler während der Erarbeitung.
  - Erstellen und Verknüpfen der Zusatzfunktionen wie Cloudinary, Google Mail Anbindung mit App Passwort
  - Commiten (deshalb ist es nicht wirklich schön 😬)


### 5.2 Prompt-Vorgehen
- **Vorgehen:** Es wurde nicht direkt nach kompletten, fertigen Seiten gefragt. Stattdessen wurde die KI iterativ genutzt. Dieses Vorgehen verhinderte Fehler und machte es mir möglich die angepassten Funktionen fortlaufend einzeln zu testen und meinen Wünschen anzupassen. Bei Bugs wurden stets Fehlermeldungen aus dem Terminal VON VsCode oder Netlify in Kombination mit dem spezifischen Code-Snippet gepromptet. Zusätzlich wurde die KI auch nach Strukturierungsvorschläge für die Datenspeicherung in der Datenbank genutzt. Ebenso wurde teilweise nachgefragt, ob Probleme nicht an xy liegen könnte.

- **Fragen:** Die KI wurde ebenfalls genutzt um in einem separaten Chat technische Möglichkeiten zu klären um basierend auf den Informationen das weitere Vorgehen zu bestimmen.

### 5.3 Reflexion
- **Nutzen:** KI erwies sich innerhalb der Projekts als extrem hilfreich und beschleunigte die Entwicklung enorm. Zudem wären viele Dinge mit meinem Know-How nicht umsetzbar gewesen. Ebenfalls half die KI auch enorm bei der Bewertung von Ideen geholfen.

- **Grenzen:** Trotz der grossen Hilfe von KI gab es teilweise Zeiten, in welcher die KI einfache Entscheidungen komplett falsch interpretierte (evtl. ist dies auf hohe Auslastung der Dienste zurückzuführen). Ebenfalls war es nicht möglich weiter zu prompten, sobald das Tokenlimit aufgebraucht war und auf ein schwächeres Modell (3.1 Flash-Lite) gewechselt wurde.

- **Risiken/Qualitätssicherung:** Ein grosses Risiko sehe ich in der unreflektierten Übernahme von Codes. Vor einer tatsächlichen produktiven Nutzung des Programms wäre es ratsam jemanden mit grosser Erfahrung den Code überblicken zu lassen und auf Sicherheitslücken und Datenschutzvorkehrungen zu überprüfen. 

