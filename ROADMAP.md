# Roadmap

## Offene Punkte

- [ ] **Visuelle Trennung des Zielzeit-Rechners**: Den Zielzeit-Rechner und den Haupt-Tracker in eigenständige Bereiche oder Tabs trennen, um die Benutzerführung zu entflechten.
- [ ] **Aufgeteilte Number-Inputs für Mischverhältnisse**: Das Freitextfeld durch drei separate `number`-Inputs für Mehl, Wasser und Anstellgut mit Validierung ersetzen.
- [ ] **Bestandsverwaltung für Anstellgut**: Vorhandenes Anstellgut (Menge in Gramm, Mehlsorte und letzter Fütterungszeitpunkt) im `localStorage` speichern und mit Rezepten abgleichen.
- [ ] **Fokus auf Auffrisch-Grenzen und Überreife**: Neben dem Peak das kritische Zeitfenster für die zwingende Neuauffrischung vor Übersäuerung und Abbau hervorheben.
- [ ] **Lagerungs- und Fütterungszeiten für den Kühlschrank**: Konkrete Verhältnisse und Zeitpläne für 2–3 Tage sowie eine Woche Kühlschranklagerung auflisten.
- [ ] **Kombinierte Übersicht für Lagerung und Reifephasen**: Visualisierung der Stabilität nach dem Peak bei Raumtemperatur und nach anschließendem Kühlen.

## Erledigte Punkte

- [x] **PWA-Basis**: Progressive Web App mit Offline-Betrieb, Manifest und Service Worker eingerichtet.
- [x] **Reifezeit-Berechnung**: Berechnung von Verdopplung, Peak und Nutzungsfenster auf Basis von Mehl, Wasser, ASG und Temperatur.
- [x] **Zielzeit-Rechner**: Rückwärts-Berechnung mit Auswahltabelle machbarer Kombinationen aus Temperatur und Verhältnis.
- [x] **Network-First Caching**: Zuverlässige Aktualisierung der Web-Assets ohne veralteten Browser-Cache.
- [x] **Mehlsorten-Auswahl**: Integration spezifischer Reifezeitfaktoren für Roggenvollkornmehl (Faktor 0,75), Roggenmehl, Weizenvollkorn, Dinkel und Weizen Typ 550.
