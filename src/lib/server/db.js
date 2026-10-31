import crypto from 'crypto';
import { randomUUID } from 'crypto'; // Falls du Node.js nutzt, ansonsten crypto.randomUUID() verwenden
import { MongoClient, ObjectId } from "mongodb";
// ÄNDERUNG: Wir nutzen den dynamischen Import, der ist sicherer für Netlify!
import { env } from '$env/dynamic/private';
import bcrypt from "bcryptjs";
import { generateToken, hashToken, generateNumericCode, escapeRegex, BCRYPT_ROUNDS } from './security.js';
import { normalizeArticleBarcodes } from '../barcodes.js';

// ==========================================
// 0. SERVERLESS CONNECTION POOLING
// ==========================================
// Die Verbindung entsteht erst beim ersten Zugriff (nicht schon beim Import):
// So braucht der Build keine Datenbank, und warme Serverless-Instanzen teilen sich eine Verbindung.
function getClientPromise() {
    if (!global._mongoClientPromise) {
        if (!env.DB_URI) throw new Error('DB_URI ist nicht gesetzt.');
        global._mongoClientPromise = new MongoClient(env.DB_URI).connect().catch((err) => {
            global._mongoClientPromise = null; // beim nächsten Aufruf neu versuchen
            throw err;
        });
    }
    return global._mongoClientPromise;
}

// Hilfsfunktion: Holt die gecachte Verbindung
async function getDb() {
    const connectedClient = await getClientPromise();
    return connectedClient.db("Sortify_Prod"); 
}


// ==========================================
// 1. KATEGORIEN VERWALTUNG
// ==========================================

async function getCategories(systemId) {
    let categories = [];
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        categories = await collection.find({ systemId: new ObjectId(systemId) }).toArray();
        categories.forEach(cat => {
            if (cat._id) cat._id = cat._id.toString();
            if (cat.systemId) cat.systemId = cat.systemId.toString(); // SvelteKit POJO Fix
        });
    } catch (error) {
        console.error("Fehler beim Laden der Kategorien:", error);
    }
    return categories;
}

async function createMainCategory(systemId, name) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const result = await collection.insertOne({
            systemId: new ObjectId(systemId), 
            name: name,
            subcategories: [], 
            createdAt: new Date()
        });
        return result.insertedId.toString(); 
    } catch (error) {
        console.error("Fehler beim Speichern der Hauptkategorie:", error);
        throw error;
    }
}

async function createSubcategory(systemId, mainCategoryId, subName) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const subId = "sub_" + Date.now() + "_" + crypto.randomBytes(3).toString("hex");
        const result = await collection.updateOne(
            { _id: new ObjectId(mainCategoryId), systemId: new ObjectId(systemId) },
            { $push: { subcategories: { id: subId, name: subName, allowed_attributes: [] } } }
        );
        return { id: subId }; // 🔥 NEU: Gibt die erstellte ID als Objekt zurück
    } catch (error) {
        console.error("Fehler beim Speichern der Unterkategorie:", error);
        throw error;
    }
}

async function deleteSubcategory(systemId, mainCategoryId, subCategoryId) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const result = await collection.updateOne(
            { _id: new ObjectId(mainCategoryId), systemId: new ObjectId(systemId) },
            { $pull: { subcategories: { id: subCategoryId } } }
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Löschen der Unterkategorie:", error);
        throw error;
    }
}

async function deleteMainCategory(systemId, id) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const result = await collection.deleteOne({ _id: new ObjectId(id), systemId: new ObjectId(systemId) });
        return result;
    } catch (error) {
        console.error("Fehler beim Löschen der Hauptkategorie:", error);
        throw error;
    }
}

async function renameMainCategory(systemId, id, newName) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const result = await collection.updateOne(
            { _id: new ObjectId(id), systemId: new ObjectId(systemId) },
            { $set: { name: newName } }
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Umbenennen der Hauptkategorie:", error);
        throw error;
    }
}

async function renameSubcategory(systemId, mainCategoryId, subCategoryId, newName) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const result = await collection.updateOne(
            { _id: new ObjectId(mainCategoryId), systemId: new ObjectId(systemId), "subcategories.id": subCategoryId },
            { $set: { "subcategories.$.name": newName } }
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Umbenennen der Unterkategorie:", error);
        throw error;
    }
}

async function updateSubcategoryAttributes(systemId, mainCategoryId, subCategoryId, attributeIds) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const result = await collection.updateOne(
            { _id: new ObjectId(mainCategoryId), systemId: new ObjectId(systemId), "subcategories.id": subCategoryId },
            { $set: { "subcategories.$.allowed_attributes": attributeIds } }
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Zuweisen der Attribute:", error);
        throw error;
    }
}

// ==========================================
// 2. FILTER-ATTRIBUTE VERWALTUNG
// ==========================================

async function getFilterAttributes(systemId) {
    let attributes = [];
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        attributes = await collection.find({ systemId: new ObjectId(systemId) }).toArray();
        attributes.forEach(attr => {
            if (attr._id) attr._id = attr._id.toString();
            if (attr.systemId) attr.systemId = attr.systemId.toString(); // SvelteKit POJO Fix
        });
    } catch (error) {
        console.error("Fehler beim Laden der Attribute:", error);
    }
    return attributes;
}

async function createFilterAttribute(systemId, attributeData) {
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        const dataToInsert = { ...attributeData, systemId: new ObjectId(systemId) };
        const result = await collection.insertOne(dataToInsert);
        return result;
    } catch (error) {
        console.error("Fehler beim Speichern des Attributs:", error);
        throw error; 
    }
}

async function deleteFilterAttribute(systemId, id) {
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        const result = await collection.deleteOne({ _id: new ObjectId(id), systemId: new ObjectId(systemId) });
        return result;
    } catch (error) {
        console.error("Fehler beim Löschen des Attributs:", error);
        throw error;
    }
}

async function updateFilterAttribute(systemId, id, attributeData) {
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        const result = await collection.updateOne(
            { _id: new ObjectId(id), systemId: new ObjectId(systemId) },
            { $set: attributeData } 
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Updaten des Attributs:", error);
        throw error;
    }
}

async function getFilterAttributeByLabel(systemId, label) {
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        const attribute = await collection.findOne({ 
            systemId: new ObjectId(systemId),
            label: { $regex: new RegExp(`^${escapeRegex(label)}$`, 'i') } 
        });
        if (attribute && attribute._id) attribute._id = attribute._id.toString();
        return attribute;
    } catch (error) {
        console.error("Fehler bei der Label-Prüfung:", error);
        return null;
    }
}

async function addOptionToFilterAttribute(systemId, id, newOption) {
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        const result = await collection.updateOne(
            { _id: new ObjectId(id), systemId: new ObjectId(systemId) },
            { $addToSet: { options: newOption } } 
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Quick-Add:", error);
        throw error;
    }
}

async function removeOptionFromFilterAttribute(systemId, id, optionToRemove) {
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        const result = await collection.updateOne(
            { _id: new ObjectId(id), systemId: new ObjectId(systemId) },
            { $pull: { options: optionToRemove } }
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Quick-Remove:", error);
        throw error;
    }
}

// ==========================================
// 3. ARTIKEL VERWALTUNG
// ==========================================

// ==========================================
// 3a. BESTANDSBEWEGUNGEN (Protokoll)
// ==========================================
// meta: { userId, userName, source } – wer hat den Bestand wo geändert (z.B. 'web', 'terminal-return')
//       project: { id, rootId, label } – Projekt, dem die Änderung zugeordnet wird (siehe projects.js)
//       requireProject: true – eine Entnahme ohne Projekt wird abgelehnt (Funktion "Projekte" aktiv)

// Entnahme ohne Projekt verhindern, wenn die Funktion "Projekte" im Lager aktiv ist
function assertProjectForWithdrawal(meta, before, after) {
    if (meta.requireProject && !meta.project && (parseFloat(after) || 0) < (parseFloat(before) || 0)) {
        throw Object.assign(new Error('Für eine Entnahme muss ein Projekt gewählt werden.'), { code: 'project_required' });
    }
}

async function logStockMovement(systemId, article, before, after, meta = {}) {
    const b = parseFloat(before) || 0, a = parseFloat(after) || 0;
    if (b !== a) await insertStockMovement(systemId, article, b, a, meta);
    // Projektbuchung: am Terminal zählt die gewogene Veränderung im Fach (meta.bookingQuantity),
    // sonst die Änderung des Gesamtbestands
    if (meta.project) {
        const quantity = meta.bookingQuantity ?? (b - a);
        if (quantity !== 0) await addProjectBooking(systemId, article, quantity, meta);
    }
}

async function insertStockMovement(systemId, article, b, a, meta) {
    try {
        const db = await getDb();
        await db.collection('stock_movements').insertOne({
            systemId: new ObjectId(systemId),
            articleId: new ObjectId(article._id),
            articleTitle: article.title || '',
            before: b,
            after: a,
            delta: Math.round((a - b) * 1000) / 1000,
            source: meta.source || 'unbekannt',
            userId: meta.userId && ObjectId.isValid(meta.userId) ? new ObjectId(meta.userId) : null,
            userName: meta.userName || '',
            projectId: meta.project ? new ObjectId(meta.project.id) : null,
            projectName: meta.project?.label || null,
            barcode: meta.barcode || null,
            createdAt: new Date()
        });
    } catch (error) {
        // Das Protokoll darf eine Bestandsänderung nie verhindern
        console.error("Bestandsbewegung konnte nicht protokolliert werden:", error);
    }
}

// Kostenbuchung für ein Projekt: Menge > 0 = Verbrauch, < 0 = Rückbuchung ins Lager.
// Der Stückpreis wird festgehalten, damit spätere Preisänderungen alte Projekte nicht verändern.
// Eigene Collection ohne Löschfrist (das Bestandsprotokoll wird nach 2 Jahren gelöscht).
async function addProjectBooking(systemId, article, quantity, meta) {
    try {
        const price = parseFloat(article.price);
        const unitPrice = Number.isFinite(price) && price > 0 ? price : null;
        const db = await getDb();
        await db.collection('project_bookings').insertOne({
            systemId: new ObjectId(systemId),
            projectId: new ObjectId(meta.project.id),
            rootProjectId: new ObjectId(meta.project.rootId),
            projectName: meta.project.label,
            articleId: new ObjectId(article._id),
            articleTitle: article.title || '',
            quantity: Math.round(quantity * 1000) / 1000,
            unitPrice,
            total: Math.round(quantity * (unitPrice || 0) * 100) / 100,
            source: meta.source || 'unbekannt',
            userId: meta.userId && ObjectId.isValid(meta.userId) ? new ObjectId(meta.userId) : null,
            userName: meta.userName || '',
            createdAt: new Date()
        });
    } catch (error) {
        console.error("Projektbuchung konnte nicht gespeichert werden:", error);
    }
}

// Letzte Bewegungen eines Artikels
async function getStockMovements(systemId, articleId, limit = 20) {
    if (!ObjectId.isValid(articleId)) return [];
    const db = await getDb();
    const rows = await db.collection('stock_movements')
        .find({ systemId: new ObjectId(systemId), articleId: new ObjectId(articleId) })
        .sort({ createdAt: -1 }).limit(limit).toArray();
    return rows.map(r => ({ id: r._id.toString(), before: r.before, after: r.after, delta: r.delta, source: r.source, userName: r.userName, projectName: r.projectName || null, barcode: r.barcode || null, createdAt: r.createdAt.toISOString() }));
}

// Meistverbrauchte Artikel der letzten Tage (Summe aller Abgänge)
async function getTopConsumption(systemId, days = 30, limit = 5) {
    const db = await getDb();
    const rows = await db.collection('stock_movements').aggregate([
        { $match: { systemId: new ObjectId(systemId), delta: { $lt: 0 }, createdAt: { $gte: new Date(Date.now() - days * 86400000) } } },
        { $group: { _id: '$articleId', title: { $last: '$articleTitle' }, used: { $sum: { $multiply: ['$delta', -1] } } } },
        { $sort: { used: -1 } },
        { $limit: limit }
    ]).toArray();
    return rows.map(r => ({ id: r._id.toString(), title: r.title, used: Math.round(r.used * 100) / 100 }));
}

async function createArticle(systemId, articleData, meta = {}) {
    try {
        const db = await getDb();
        const collection = db.collection("articles");
        // Initialisiere assigned_barcodes immer als leeres Array!
        const dataToInsert = { ...articleData, systemId: new ObjectId(systemId), assigned_barcodes: [] };
        const result = await collection.insertOne(dataToInsert);
        await logStockMovement(systemId, { _id: result.insertedId, title: articleData.title }, 0, articleData.istBestand, { ...meta, source: meta.source || 'angelegt' });
        return result;
    } catch (error) {
        console.error("Fehler beim Speichern des Artikels:", error);
        throw error;
    }
}

async function getArticles(systemId) {
    let articles = [];
    try {
        const db = await getDb();
        
        const articlesCollection = db.collection("articles");
        articles = await articlesCollection.find({ systemId: new ObjectId(systemId) }).sort({ createdAt: -1 }).toArray();
        
        // Kleine Schönheitskorrektur für das Frontend:
        articles.forEach(article => {
            if (article._id) article._id = article._id.toString();
            if (article.mainCategoryId) article.mainCategoryId = article.mainCategoryId.toString();
            if (article.systemId) article.systemId = article.systemId.toString(); // SvelteKit POJO Fix
            
            // Damit das Frontend die Barcodes weiter so anzeigen kann wie bisher:
            if (Array.isArray(article.assigned_barcodes)) {
                article.display_barcodes = article.assigned_barcodes.map(b => typeof b === 'object' ? b.barcode : b);
            } else if (article.assigned_barcode) {
                article.display_barcodes = [article.assigned_barcode];
            } else {
                article.display_barcodes = [];
            }
            
            // Sicherstellen, dass alte Artikel ohne Waagen-Nutzung ihren Bestand behalten
            article.istBestand = parseFloat(article.istBestand) || 0;
        });
        
    } catch (error) {
        console.error("Fehler beim Laden der Artikel:", error);
    }
    return articles;
}

async function getArticleById(systemId, id) {
    try {
        const db = await getDb();
        const collection = db.collection("articles");
        const article = await collection.findOne({ _id: new ObjectId(id), systemId: new ObjectId(systemId) });
        
        if (article) {
            article._id = article._id.toString(); 
            if (article.mainCategoryId) article.mainCategoryId = article.mainCategoryId.toString();
        }
        return article;
    } catch (error) {
        console.error("Fehler beim Laden des Artikels:", error);
        return null;
    }
}

async function updateArticle(systemId, id, updateData, meta = {}) {
    try {
        const db = await getDb();
        const collection = db.collection("articles");
        const filter = { _id: new ObjectId(id), systemId: new ObjectId(systemId) };
        // Bei Bestandsänderung den alten Wert fürs Protokoll merken
        const before = updateData.istBestand !== undefined
            ? await collection.findOne(filter, { projection: { istBestand: 1, title: 1, price: 1 } })
            : null;
        if (before) assertProjectForWithdrawal(meta, before.istBestand, updateData.istBestand);
        const result = await collection.updateOne(filter, { $set: updateData });
        if (before) await logStockMovement(systemId, before, before.istBestand, updateData.istBestand, meta);
        return result;
    } catch (error) {
        console.error("Fehler beim Aktualisieren des Artikels:", error);
        throw error;
    }
}

// Artikel mit gleicher GTIN (Leerzeichen und Gross-/Kleinschreibung egal), z.B. für eine Warnung beim Anlegen
async function findArticlesByGtin(systemId, gtin, excludeId = null) {
    const compact = String(gtin || '').replace(/\s+/g, '');
    if (!compact || compact.length > 64) return [];
    const pattern = '^\\s*' + compact.split('').map(escapeRegex).join('\\s*') + '\\s*$';
    const filter = { systemId: new ObjectId(systemId), gtin: { $regex: pattern, $options: 'i' } };
    if (excludeId && ObjectId.isValid(String(excludeId))) filter._id = { $ne: new ObjectId(String(excludeId)) };
    const db = await getDb();
    const rows = await db.collection('articles').find(filter, { projection: { title: 1, gtin: 1 } }).limit(5).toArray();
    return rows.map(r => ({ id: r._id.toString(), title: r.title, gtin: r.gtin }));
}

async function deleteArticle(systemId, id) {
    try {
        const db = await getDb();
        const collection = db.collection("articles");
        const result = await collection.deleteOne({ 
            _id: new ObjectId(id), 
            systemId: new ObjectId(systemId) 
        });
        // Offene Bestellungen des Artikels können nicht mehr eingelagert werden
        if (result.deletedCount === 1) {
            await db.collection('orders').updateMany(
                { systemId: new ObjectId(systemId), articleId: new ObjectId(id), status: 'open' },
                { $set: { status: 'cancelled', closedAt: new Date(), cancelReason: 'Artikel gelöscht' } }
            );
        }
        return result;
    } catch (error) {
        console.error("Fehler beim Löschen des Artikels:", error);
        throw error;
    }
}

// ==========================================
// 4. BENUTZER VERWALTUNG (BCRYPT)
// ==========================================
// ACHTUNG: Hier bleibt alles auf globaler User-Ebene, keine systemId nötig!

// Sucht den Nutzer über seine E-Mail ODER seinen Benutzernamen
export async function getUserByIdentifier(identifier) {
    const db = await getDb();
    // Prüfen, ob der Identifier überhaupt existiert, um Fehler zu vermeiden
    if (!identifier) return null;
    
    return await db.collection('users').findOne({
        $or: [
            { email: identifier.toLowerCase() },
            { username: identifier.toLowerCase() }
        ]
    });
}

async function createInitialUser(email, plainTextPassword, userData = {}, verificationData = {}) {
    try {
        const db = await getDb();
        const collection = db.collection("users");
        const existingUser = await collection.findOne({ email: email });
        if (existingUser) return { success: false, message: "Benutzer existiert bereits" };

        const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
        const hashedPassword = await bcrypt.hash(plainTextPassword, salt);

        const result = await collection.insertOne({
            email: email,
            password: hashedPassword,
            firstName: userData.firstName || "",
            lastName: userData.lastName || "",
            country: userData.country || "",
            birthDate: userData.birthDate ? new Date(userData.birthDate) : null,
            createdAt: new Date(),
            
            isVerified: false,
            verificationCode: verificationData.code,
            verificationToken: verificationData.token,
            verificationExpires: verificationData.expires
        });

        return { success: true, userId: result.insertedId.toString() };
    } catch (error) {
        throw error;
    }
}

async function verifyUser(emailOrToken, isToken = false) {
    try {
        const db = await getDb();
        const collection = db.collection("users");
        const query = isToken ? { verificationToken: emailOrToken } : { email: emailOrToken };
        
        const user = await collection.findOne(query);
        
        if (!user) return { success: false, message: "Nutzer nicht gefunden." };
        if (user.isVerified) return { success: false, message: "Account ist bereits verifiziert." };
        if (user.verificationExpires < new Date()) return { success: false, message: "Der Code ist abgelaufen. Bitte registriere dich neu." };

        await collection.updateOne(
            { _id: user._id },
            { 
                $set: { isVerified: true },
                $unset: { verificationCode: "", verificationToken: "", verificationExpires: "" }
            }
        );

        return { success: true };
    } catch (error) {
        console.error(error);
        return { success: false, message: "Datenbankfehler bei der Verifizierung." };
    }
}

async function getUserById(id) {
    try {
        if (!ObjectId.isValid(id)) return null; 
        
        const db = await getDb();
        const collection = db.collection("users");
        const user = await collection.findOne({ _id: new ObjectId(id) });
        
        if (user) {
            // 1. Haupt-ID in String umwandeln
            if (user._id) user._id = user._id.toString();
            
            // 2. 🔥 POJO-Fix: Alle systemIds im systems-Array in Strings umwandeln
            if (user.systems && Array.isArray(user.systems)) {
                user.systems = user.systems.map(sys => ({
                    ...sys,
                    systemId: sys.systemId ? sys.systemId.toString() : null
                }));
            }
        }
        return user;
    } catch (error) {
        console.error("Fehler beim Suchen des Benutzers nach ID:", error);
        return null;
    }
}

async function updateUser(id, updateData) {
    try {
        const db = await getDb();
        const collection = db.collection("users");
        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Aktualisieren des Benutzers:", error);
        throw error;
    }
}

// ==========================================
// 5. SECURITY & LOGGING
// ==========================================

async function getLoginAttempt(ip) {
    try {
        const db = await getDb();
        const collection = db.collection("loginAttempts");
        const attempt = await collection.findOne({ ip: ip });
        if (attempt && attempt._id) attempt._id = attempt._id.toString();
        return attempt;
    } catch (error) {
        console.error("Fehler beim Laden der Login-Versuche:", error);
        return null;
    }
}

async function upsertLoginAttempt(ip, count, lockUntil) {
    try {
        const db = await getDb();
        const collection = db.collection("loginAttempts");
        return await collection.updateOne(
            { ip: ip },
            { 
                $set: { 
                    count: count, 
                    lockUntil: lockUntil,
                    createdAt: new Date()
                } 
            },
            { upsert: true }
        );
    } catch (error) {
        console.error("Fehler beim Speichern des Login-Versuchs:", error);
    }
}

async function deleteLoginAttempt(ip) {
    try {
        const db = await getDb();
        const collection = db.collection("loginAttempts");
        return await collection.deleteOne({ ip: ip });
    } catch (error) {
        console.error("Fehler beim Löschen des Login-Versuchs:", error);
    }
}

async function createSessionLog(sessionId, userId, email) {
    try {
        const db = await getDb();
        const collection = db.collection("sessionLogs");
        return await collection.insertOne({
            sessionId: sessionId,
            userId: new ObjectId(userId), // Session gehört weiterhin zum User
            email: email,
            loginTime: new Date(),
            logoutTime: null, 
            lastActive: new Date(),
            createdAt: new Date()
        });
    } catch (error) {
        console.error("Fehler beim Erstellen des Session-Logs:", error);
    }
}

async function endSessionLog(sessionId) {
    try {
        const db = await getDb();
        const collection = db.collection("sessionLogs");
        return await collection.updateOne(
            { sessionId: sessionId },
            { $set: { logoutTime: new Date(), lastActive: new Date() } }
        );
    } catch (error) {
        console.error("Fehler beim Beenden des Session-Logs:", error);
    }
}

// Generischer Zähler gegen Brute-Force & Mail-Spam (z.B. key = "verify:max@muster.ch").
// Zählt atomar hoch; nach Ablauf des Fensters beginnt die Zählung neu.
async function rateLimit(key, max, windowMs) {
    try {
        const db = await getDb();
        const now = new Date();
        const isActive = { $gt: ['$expiresAt', now] };
        const entry = await db.collection('rate_limits').findOneAndUpdate(
            { key },
            [{ $set: {
                count: { $cond: [isActive, { $add: ['$count', 1] }, 1] },
                expiresAt: { $cond: [isActive, '$expiresAt', new Date(now.getTime() + windowMs)] }
            } }],
            { upsert: true, returnDocument: 'after' }
        );
        return {
            allowed: entry.count <= max,
            retryAfterMinutes: Math.ceil((entry.expiresAt.getTime() - now.getTime()) / 60000)
        };
    } catch (error) {
        // Fail-open: Ein DB-Problem soll den Login nicht komplett blockieren
        console.error("Fehler im Rate-Limiter:", error);
        return { allowed: true, retryAfterMinutes: 0 };
    }
}

// ==========================================
// 5b. SESSIONS (Zufalls-Token statt User-ID im Cookie)
// ==========================================
// type 'session'    = echte Anmeldung
// type 'pending2fa' = Passwort korrekt, 2FA-Code steht noch aus

async function createSession(userId, type = 'session', maxAgeSeconds = 60 * 60 * 24 * 7, device = {}) {
    const db = await getDb();
    const token = generateToken();
    const tokenHash = hashToken(token);
    await db.collection('sessions').insertOne({
        tokenHash,
        userId: new ObjectId(userId),
        type,
        attempts: 0,
        // Für die Geräteliste im Profil
        userAgent: String(device.userAgent || '').slice(0, 300),
        ip: String(device.ip || '').slice(0, 64),
        createdAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + maxAgeSeconds * 1000)
    });
    return { token, tokenHash };
}

async function getSession(token, type = 'session') {
    if (!token) return null;
    try {
        const db = await getDb();
        return await db.collection('sessions').findOne({
            tokenHash: hashToken(token),
            type,
            expiresAt: { $gt: new Date() }
        });
    } catch (error) {
        console.error("Fehler beim Laden der Session:", error);
        return null;
    }
}

// Zählt Fehlversuche (z.B. 2FA) und liefert den neuen Stand zurück
async function incrementSessionAttempts(token) {
    const db = await getDb();
    const result = await db.collection('sessions').findOneAndUpdate(
        { tokenHash: hashToken(token) },
        { $inc: { attempts: 1 } },
        { returnDocument: 'after' }
    );
    return result?.attempts ?? Infinity;
}

async function deleteSession(token) {
    if (!token) return;
    const db = await getDb();
    await db.collection('sessions').deleteOne({ tokenHash: hashToken(token) });
}

// "Zuletzt aktiv" höchstens alle 10 Minuten speichern (kein Schreibzugriff bei jedem Seitenaufruf)
async function touchSession(session) {
    if (session.lastSeenAt && Date.now() - new Date(session.lastSeenAt).getTime() < 10 * 60 * 1000) return;
    const db = await getDb();
    await db.collection('sessions').updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } });
}

// Angemeldete Geräte eines Nutzers (für das Profil)
async function listUserSessions(userId) {
    const db = await getDb();
    const sessions = await db.collection('sessions')
        .find({ userId: new ObjectId(userId), type: 'session', expiresAt: { $gt: new Date() } },
              { projection: { tokenHash: 1, userAgent: 1, ip: 1, createdAt: 1, lastSeenAt: 1 } })
        .sort({ lastSeenAt: -1 })
        .toArray();
    return sessions;
}

// Ein einzelnes Gerät abmelden (nur eigene Sessions)
async function deleteUserSessionById(userId, sessionId) {
    if (!ObjectId.isValid(sessionId)) return;
    const db = await getDb();
    await db.collection('sessions').deleteOne({ _id: new ObjectId(sessionId), userId: new ObjectId(userId) });
}

// Meldet einen Nutzer überall ab (z.B. nach Passwortänderung)
async function deleteUserSessions(userId, exceptToken = null) {
    const db = await getDb();
    const filter = { userId: new ObjectId(userId) };
    if (exceptToken) filter.tokenHash = { $ne: hashToken(exceptToken) };
    await db.collection('sessions').deleteMany(filter);
}

async function savePasswordResetToken(email) {
    try {
        const db = await getDb();
        const collection = db.collection("users");
        
        const cleanEmail = email.toString().toLowerCase().trim();
        const user = await collection.findOne({ 
            email: { $regex: new RegExp(`^${escapeRegex(cleanEmail)}$`, 'i') } 
        });

        if (!user) return null;

        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000); 

        await collection.updateOne(
            { _id: user._id },
            { $set: { resetToken: token, resetExpires: expires } }
        );
        
        return token; 

    } catch (error) {
        console.error("[DB] Fehler beim Speichern des Reset-Tokens:", error);
        return null;
    }
}

async function getUserByResetToken(token) {
    try {
        const db = await getDb();
        const collection = db.collection("users");
        const user = await collection.findOne({ resetToken: token });
        
        if (!user || user.resetExpires < new Date()) return null;
        if (user._id) user._id = user._id.toString();
        
        return user;
    } catch (error) {
        console.error("Fehler beim Suchen des Tokens:", error);
        return null;
    }
}

async function resetUserPassword(userId, plainTextPassword) {
    try {
        const db = await getDb();
        const collection = db.collection("users");
        const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
        const hashedPassword = await bcrypt.hash(plainTextPassword, salt);

        await collection.updateOne(
            { _id: new ObjectId(userId) },
            { 
                $set: { password: hashedPassword },
                $unset: { resetToken: "", resetExpires: "" } 
            }
        );
        await deleteUserSessions(userId);
        return true;
    } catch (error) {
        console.error("Fehler beim Zurücksetzen des Passworts:", error);
        return false;
    }
} 

async function renewVerificationData(email) {
    try {
        const db = await getDb();
        const collection = db.collection("users");
        
        const code = generateNumericCode();
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 15 * 60000); 

        // Nur für existierende, noch nicht bestätigte Konten (sonst könnte man Mails an beliebige Adressen auslösen)
        const result = await collection.updateOne(
            { email: email, isVerified: false },
            { $set: { verificationCode: code, verificationToken: token, verificationExpires: expires } }
        );
        if (result.matchedCount === 0) return null;
        
        return { code, token };
    } catch (error) {
        console.error("Fehler beim Erneuern der Verifizierungsdaten:", error);
        return null;
    }
}

// ==========================================
// 6. HARDWARE & REGAL-VERWALTUNG
// ==========================================

// Befehl für die Terminals speichern und per MQTT an die gekoppelten Geräte senden.
// (Ältere Terminals, die direkt die Datenbank abfragen, lesen das Dokument weiterhin.)
async function insertDeviceCommand(db, collectionName, doc, { dispatch = true } = {}) {
    const result = await db.collection(collectionName).insertOne(doc);
    if (dispatch) {
        const { dispatchCommandDoc } = await import('./devices.js'); // erst hier laden: devices.js nutzt db.js
        await dispatchCommandDoc(collectionName, { ...doc, _id: result.insertedId });
    }
    return result;
}

async function createHardwareCommand(systemId, command, color = null) {
    try {
        const db = await getDb();
        const commandsCollection = db.collection('hardware_commands');

        let commandArray = Array.isArray(command) ? command : [parseInt(command)];

        const commandDoc = {
            systemId: new ObjectId(systemId),
            drawer_ids: commandArray, 
            status: "pending",
            createdAt: new Date()
        };

        // 🔥 NEU: Die Farbe wird an das Dokument angehängt, falls eine übergeben wurde
        if (color) {
            commandDoc.color = color;
        }

        await insertDeviceCommand(db, 'hardware_commands', commandDoc);

        return true;
    } catch (error) {
        console.error("Fehler in createHardwareCommand:", error);
        throw error;
    }
}

async function getShelves(systemId) {
    try {
        const db = await getDb();
        const collection = db.collection('shelves');

        const shelves = await collection.find({ systemId: new ObjectId(systemId) })
                                        .sort({ start_index: 1 })
                                        .toArray();
                                        
        // NEU: Auch hier müssen IDs in Strings gewandelt werden!
        shelves.forEach(shelf => {
            if (shelf._id) shelf._id = shelf._id.toString();
            if (shelf.systemId) shelf.systemId = shelf.systemId.toString(); // SvelteKit POJO Fix
        });

        return shelves;
    } catch (error) {
        console.error("Fehler beim Abrufen der Regale:", error);
        return [];
    }
}

async function createNewShelf(systemId, shelfName, startIndex, drawerCount, barcodes) {
    try {
        const db = await getDb();
        const shelvesCollection = db.collection('shelves');

        const newShelf = {
            systemId: new ObjectId(systemId),
            name: shelfName,
            start_index: parseInt(startIndex),
            drawer_count: parseInt(drawerCount),
            drawers: barcodes, 
            createdAt: new Date()
        };

        await shelvesCollection.insertOne(newShelf);
        return true;
    } catch (error) {
        console.error("Fehler beim Erstellen des Regals:", error);
        throw error;
    }
}

async function updateDrawerBarcode(systemId, shelfId, ledIndex, newBarcode) {
    try {
        const db = await getDb();
        const collection = db.collection('shelves');

        await collection.updateOne(
            { 
                _id: new ObjectId(shelfId), 
                systemId: new ObjectId(systemId), 
                "drawers.ledIndex": parseInt(ledIndex) 
            },
            { 
                $set: { "drawers.$.barcode": newBarcode } 
            }
        );
        return true;
    } catch (error) {
        console.error("Fehler beim Aktualisieren des Barcodes:", error);
        throw error;
    }
}

async function deleteShelf(systemId, shelfId) {
    try {
        const db = await getDb();
        const collection = db.collection('shelves');

        await collection.deleteOne({ 
            _id: new ObjectId(shelfId), 
            systemId: new ObjectId(systemId) 
        });
        
        return true;
    } catch (error) {
        console.error("Fehler beim Löschen des Regals:", error);
        throw error;
    }
}

async function assignBarcodeToArticle(systemId, articleId, barcode) {
    try {
        const db = await getDb();
        const collection = db.collection('articles');

        if (barcode === null) {
             await collection.updateOne(
                { _id: new ObjectId(articleId), systemId: new ObjectId(systemId) },
                { $set: { assigned_barcodes: [], updatedAt: new Date() } }
            );
        } else {
             await collection.updateOne(
                { _id: new ObjectId(articleId), systemId: new ObjectId(systemId) },
                { $addToSet: { assigned_barcodes: barcode }, $set: { updatedAt: new Date() } }
            );
        }
       
        return true;
    } catch (error) {
        console.error("Fehler beim Verknüpfen des Artikels:", error);
        throw error;
    }
}

async function checkIfBarcodeExists(systemId, barcode) {
    try {
        const db = await getDb();
        const collection = db.collection('shelves');

        const shelf = await collection.findOne({
            systemId: new ObjectId(systemId),
            "drawers.barcode": barcode
        });

        return !!shelf; 
    } catch (error) {
        console.error("Fehler beim Prüfen des Barcodes:", error);
        return false;
    }
}

export async function triggerLedByBarcode(systemId, barcode, arg3 = false) {
    try {
        // 🔥 FIX 1: Echtes Hardware-Blau als Fallback
        let color = '#0000FF'; 
        let singleOnly = false;

        if (typeof arg3 === 'string') {
            color = arg3;
            singleOnly = true; 
        } else if (typeof arg3 === 'boolean') {
            singleOnly = arg3;
        }

        const db = await getDb();
        let barcodesToLightUp = [];
        
        if (singleOnly) {
            // 🔥 FIX 2: Wenn wir gezielt nur ein Fach ansteuern (z.B. ein leeres Fach),
            // dürfen wir NICHT nach einem Artikel suchen, da das leere Fach noch keinen hat!
            barcodesToLightUp = [barcode];
        } else {
            // 1. Artikel finden (nur wenn wir alle Fächer des Artikels suchen)
            const article = await db.collection('articles').findOne({ 
                systemId: new ObjectId(systemId), 
                $or: [
                    { "assigned_barcodes.barcode": barcode },
                    { assigned_barcodes: barcode },
                    { assigned_barcode: barcode }
                ]
            });
            
            // Wenn kein Artikel da ist und wir nicht im singleOnly-Modus sind -> Abbruch
            if (!article) return 0; 
            
            // 2. Barcodes extrahieren
            if (Array.isArray(article.assigned_barcodes)) {
                barcodesToLightUp = article.assigned_barcodes.map(b => typeof b === 'object' ? b.barcode : b);
            } else if (article.assigned_barcode) {
                barcodesToLightUp = [article.assigned_barcode];
            }
        }

        let drawerIdsToLightUp = [];

        // 3. Suche in allen Regalen nach den passenden LED-Indizes
        const shelves = await db.collection('shelves').find({ systemId: new ObjectId(systemId) }).toArray();
        shelves.forEach(shelf => {
            if (!shelf.drawers) return;
            shelf.drawers.forEach(drawer => {
                if (barcodesToLightUp.includes(drawer.barcode)) {
                    drawerIdsToLightUp.push(parseInt(drawer.ledIndex) + 1);
                }
            });
        });

        // 4. Hardware-Befehl absetzen
        if (drawerIdsToLightUp.length > 0) {
            await insertDeviceCommand(db, 'hardware_commands', {
                systemId: new ObjectId(systemId),
                drawer_ids: drawerIdsToLightUp,
                color: color, 
                mode: "solid", // 🔥 FIX 3: Zwingend hinzufügen, damit es ruhig leuchtet!
                status: "pending",
                createdAt: new Date()
            });
        }
        
        return drawerIdsToLightUp.length;
    } catch (error) {
        console.error("Fehler in triggerLedByBarcode:", error);
        throw error;
    }
}

export async function triggerLedsByBarcodeArray(systemId, barcodesArray, color = '#3b82f6') {
    try {
        const db = await getDb();
        let drawerIdsToLightUp = [];

        // Suche in allen Regalen nach den passenden LED-Indizes für ALLE übergebenen Barcodes
        const shelves = await db.collection('shelves').find({ systemId: new ObjectId(systemId) }).toArray();
        shelves.forEach(shelf => {
            if (!shelf.drawers) return;
            shelf.drawers.forEach(drawer => {
                if (barcodesArray.includes(drawer.barcode)) {
                    // +1 weil die Hardware 1-basiert arbeitet (in Python)
                    drawerIdsToLightUp.push(parseInt(drawer.ledIndex) + 1);
                }
            });
        });

        // Ein EINZIGER Hardware-Befehl für alle gefundenen Fächer!
        if (drawerIdsToLightUp.length > 0) {
            await insertDeviceCommand(db, 'hardware_commands', {
                systemId: new ObjectId(systemId),
                drawer_ids: drawerIdsToLightUp, // Hier liegt jetzt das Array [4, 12] drin!
                color: color,
                status: "pending",
                createdAt: new Date()
            });
        }
        
        return drawerIdsToLightUp.length;
    } catch (error) {
        console.error("Fehler in triggerLedsByBarcodeArray:", error);
        throw error;
    }
}

async function getArticleByBarcode(systemId, barcode) {
    try {
        const db = await getDb();
        return await db.collection('articles').findOne({
            systemId: new ObjectId(systemId),
            $or: [
                { "assigned_barcodes.barcode": barcode },
                { assigned_barcodes: barcode },
                { assigned_barcode: barcode } 
            ]
        });
    } catch (error) {
        console.error("Fehler bei getArticleByBarcode:", error);
        return null;
    }
}

async function createScaleRequest(systemId, barcode) {
    const db = await getDb();
    const result = await insertDeviceCommand(db, 'scale_requests', {
        systemId: new ObjectId(systemId),
        barcode: barcode,
        status: 'pending',  
        weight: null,       
        createdAt: new Date()
    });
    return result.insertedId.toString();
}

async function getScaleRequest(requestId) {
    if (!ObjectId.isValid(requestId)) return null;
    const db = await getDb();
    return await db.collection('scale_requests').findOne({ 
        _id: new ObjectId(requestId) 
    });
}

async function updateArticleStock(systemId, articleId, newStock) {
    const db = await getDb();
    await db.collection('articles').updateOne(
        { _id: new ObjectId(articleId), systemId: new ObjectId(systemId) },
        { $set: { istBestand: newStock } }
    );
}

async function assignBarcodeAndWeights(systemId, articleId, barcode, boxWeight, itemWeight, meta = {}) {
    try {
        const db = await getDb();
        const article = await db.collection('articles').findOne({ _id: new ObjectId(articleId), systemId: new ObjectId(systemId) });
        if(!article) throw new Error("Artikel nicht gefunden");
        
        let barcodes = [];
        let oldTotalStock = parseFloat(article.istBestand) || 0;

        if (Array.isArray(article.assigned_barcodes)) {
            article.assigned_barcodes.forEach(b => {
                if (typeof b === 'object' && b.barcode) {
                    barcodes.push({ barcode: String(b.barcode).trim(), stock: parseFloat(b.stock) || 0 });
                } else if (typeof b === 'string') {
                    barcodes.push({ barcode: String(b).trim(), stock: 0 });
                }
            });
        }
        if (article.assigned_barcode && typeof article.assigned_barcode === 'string') {
            const oldMainBarcode = String(article.assigned_barcode).trim();
            const existing = barcodes.find(b => b.barcode === oldMainBarcode);
            if (existing) {
                if (existing.stock === 0 && barcodes.every(b => b.stock === 0)) existing.stock = oldTotalStock;
            } else {
                barcodes.push({ barcode: oldMainBarcode, stock: oldTotalStock });
            }
        }
        barcodes = barcodes.filter((value, index, self) => index === self.findIndex((t) => t.barcode === value.barcode));

        if (!barcodes.some(b => b.barcode === barcode) && barcodes.length < 10) {
            barcodes.push({ barcode: barcode, stock: 0 });
        }

        const newTotalStock = barcodes.reduce((sum, b) => sum + (parseFloat(b.stock) || 0), 0);

        await db.collection('articles').updateOne(
            { _id: new ObjectId(articleId), systemId: new ObjectId(systemId) },
            { 
                $set: { 
                    assigned_barcodes: barcodes,
                    "attributes.itemWeight": parseFloat(itemWeight),
                    istBestand: newTotalStock
                },
                $unset: { assigned_barcode: "" } 
            }
        );
        await logStockMovement(systemId, article, oldTotalStock, newTotalStock, meta);

        await db.collection('shelves').updateOne(
            { systemId: new ObjectId(systemId), "drawers.barcode": barcode },
            { 
                $set: { "drawers.$.boxWeight": parseFloat(boxWeight) },
                $unset: { "drawers.$.stock": "" } 
            }
        );
        return true;
    } catch (error) {
        console.error("Fehler bei assignBarcodeAndWeights:", error);
        throw error;
    }
}

async function getDrawerByBarcode(systemId, barcode) {
    try {
        const db = await getDb();
        const shelf = await db.collection('shelves').findOne({
            systemId: new ObjectId(systemId),
            "drawers.barcode": barcode
        });
        
        return shelf ? shelf.drawers.find(d => d.barcode === barcode) : null;
    } catch (error) {
        console.error("Fehler bei getDrawerByBarcode:", error);
        return null;
    }
}

// Bestand eines Fachs nach dem Wiegen am Terminal (legt das Fach bei Bedarf neu an)
async function updateArticleStockFromWeights(systemId, articleId, barcode, newStock, meta = {}) {
    return setDrawerStock(systemId, articleId, barcode, newStock, meta, { weighed: true });
}

// Setzt den Bestand EINES Fachs; der Gesamtbestand ist immer die Summe aller Fächer.
// weighed: true = Messung am Terminal, false = manuelle Änderung im Web (nur bestehende Fächer)
async function setDrawerStock(systemId, articleId, barcode, newStock, meta = {}, { weighed = false } = {}) {
    try {
        const db = await getDb();
        const article = await db.collection('articles').findOne({ 
            _id: new ObjectId(articleId), 
            systemId: new ObjectId(systemId) 
        });

        if (!article) throw new Error('Artikel nicht gefunden');

        // Auch alte Datenformate (einzelner String, String-Liste) einheitlich behandeln
        let barcodes = (normalizeArticleBarcodes(article) ?? (Array.isArray(article.assigned_barcodes) ? article.assigned_barcodes : []))
            .map(b => ({ ...b }));

        const targetBarcodeIndex = barcodes.findIndex(b => b.barcode === barcode);
        if (targetBarcodeIndex === -1 && !weighed) {
            throw Object.assign(new Error('Dieses Fach gehört nicht zu diesem Artikel.'), { code: 'unknown_drawer' });
        }
        // Was physisch aus diesem Fach entnommen (> 0) bzw. hineingelegt (< 0) wurde
        const oldDrawerStock = targetBarcodeIndex !== -1 ? (parseFloat(barcodes[targetBarcodeIndex].stock) || 0) : 0;
        const withdrawn = Math.round((oldDrawerStock - (parseFloat(newStock) || 0)) * 1000) / 1000;
        
        if (targetBarcodeIndex !== -1) {
            barcodes[targetBarcodeIndex].stock = newStock;
            if (weighed) barcodes[targetBarcodeIndex].lastWeighedAt = new Date();
        } else {
            barcodes.push({ barcode: barcode, stock: newStock, lastWeighedAt: new Date() });
        }

        const totalStock = barcodes.reduce((sum, b) => sum + (parseFloat(b.stock) || 0), 0);
        assertProjectForWithdrawal(meta, oldDrawerStock, newStock);

        await db.collection('articles').updateOne(
            { _id: new ObjectId(articleId), systemId: new ObjectId(systemId) },
            { 
                $set: { 
                    assigned_barcodes: barcodes,
                    istBestand: totalStock,
                    ...(weighed ? { lastWeighedAt: new Date() } : {})
                },
                $unset: { assigned_barcode: "" } 
            }
        );
        await logStockMovement(systemId, article, article.istBestand, totalStock, { ...meta, barcode, bookingQuantity: withdrawn });

    } catch (error) {
        // Erwartete Ablehnungen (Projekt fehlt, fremdes Fach) nicht als Serverfehler protokollieren
        if (!['project_required', 'unknown_drawer'].includes(error.code)) console.error("Fehler bei setDrawerStock:", error);
        throw error;
    }
}
async function removeBarcodes(systemId, articleId, barcodeToRemove = null, meta = {}) {
    try {
        const db = await getDb();
        const article = await db.collection('articles').findOne({ _id: new ObjectId(articleId), systemId: new ObjectId(systemId) });
        if (!article) return;

        let barcodes = [];
        let oldTotalStock = parseFloat(article.istBestand) || 0;

        if (Array.isArray(article.assigned_barcodes)) {
            article.assigned_barcodes.forEach(b => {
                if (typeof b === 'object' && b.barcode) {
                    barcodes.push({ barcode: String(b.barcode).trim(), stock: parseFloat(b.stock) || 0 });
                } else if (typeof b === 'string') {
                    barcodes.push({ barcode: String(b).trim(), stock: 0 });
                }
            });
        }
        if (article.assigned_barcode && typeof article.assigned_barcode === 'string') {
            const oldMainBarcode = String(article.assigned_barcode).trim();
            const existing = barcodes.find(b => b.barcode === oldMainBarcode);
            if (existing) {
                if (existing.stock === 0 && barcodes.every(b => b.stock === 0)) existing.stock = oldTotalStock;
            } else {
                barcodes.push({ barcode: oldMainBarcode, stock: oldTotalStock });
            }
        }
        barcodes = barcodes.filter((value, index, self) => index === self.findIndex((t) => t.barcode === value.barcode));

        if (barcodeToRemove) {
            barcodes = barcodes.filter(b => b.barcode !== barcodeToRemove);
        } else {
            barcodes = []; 
        }

        const newTotalStock = barcodes.reduce((sum, b) => sum + (parseFloat(b.stock) || 0), 0);

        await db.collection('articles').updateOne(
            { _id: new ObjectId(articleId), systemId: new ObjectId(systemId) },
            { 
                $set: { 
                    assigned_barcodes: barcodes,
                    istBestand: newTotalStock 
                },
                $unset: { assigned_barcode: "" } 
            }
        );
        await logStockMovement(systemId, article, oldTotalStock, newTotalStock, meta);
    } catch (error) {
        console.error("Fehler bei removeBarcodes:", error);
        throw error;
    }
}
async function logArticleAction(systemId, articleId, actionType) {
    try {
        const db = await getDb();
        let updateFields = {};
        
        if (actionType === 'return') updateFields.lastReturnedAt = new Date();
        if (actionType === 'pick') updateFields.lastPickedAt = new Date();
        if (actionType === 'weigh') updateFields.lastWeighedAt = new Date();

        await db.collection('articles').updateOne(
            { _id: new ObjectId(articleId), systemId: new ObjectId(systemId) },
            { $set: updateFields }
        );
    } catch (error) {
        console.error("Fehler in logArticleAction:", error);
        throw error;
    }
}

async function updateArticleItemWeight(systemId, articleId, newItemWeight) {
    try {
        const db = await getDb();
        await db.collection('articles').updateOne(
            { _id: new ObjectId(articleId), systemId: new ObjectId(systemId) },
            { $set: { "attributes.itemWeight": newItemWeight } }
        );
    } catch (error) {
        console.error("Fehler bei updateArticleItemWeight:", error);
        throw error;
    }
}

export async function triggerEmptyLedsBlue(systemId, color = '#0000FF') {
    try {
        const db = await getDb();

        const shelves = await db.collection('shelves').find({ systemId: new ObjectId(systemId) }).toArray();
        let allDrawers = [];
        shelves.forEach(shelf => {
            if (shelf.drawers) {
                shelf.drawers.forEach(d => {
                    if (d.barcode) allDrawers.push(d);
                });
            }
        });

        // Nur die belegten Barcodes laden statt aller Artikel (alte und neue Datenformate)
        const articleFilter = { systemId: new ObjectId(systemId) };
        const [barcodeEntries, legacyBarcodes] = await Promise.all([
            db.collection('articles').distinct('assigned_barcodes', articleFilter),
            // Altes Einzelfeld zählt (wie bisher) nur, wenn es noch kein Barcode-Array gibt
            db.collection('articles').distinct('assigned_barcode', { ...articleFilter, assigned_barcodes: { $not: { $type: 'array' } } })
        ]);
        let assignedBarcodes = new Set();
        [...barcodeEntries, ...legacyBarcodes].forEach(b => {
            const code = b && typeof b === 'object' ? b.barcode : b;
            if (code) assignedBarcodes.add(code);
        });

        let emptyDrawerIds = [];
        allDrawers.forEach(drawer => {
            if (!assignedBarcodes.has(drawer.barcode)) {
                emptyDrawerIds.push(parseInt(drawer.ledIndex) + 1); 
            }
        });

        if (emptyDrawerIds.length > 0) {
            await insertDeviceCommand(db, 'hardware_commands', {
                systemId: new ObjectId(systemId),
                drawer_ids: emptyDrawerIds,
                color: color,      // 🔥 HIER: Nimmt jetzt den Hex-Code aus dem Frontend!
                mode: "solid",     
                status: "pending",
                createdAt: new Date()
            });
        }

        return emptyDrawerIds.length;
    } catch (error) {
        console.error("Fehler in triggerEmptyLedsBlue:", error);
        throw error;
    }
}

async function triggerSingleLedBlue(systemId, barcode) {
    try {
        const db = await getDb();
        const shelf = await db.collection('shelves').findOne({
            systemId: new ObjectId(systemId),
            "drawers.barcode": barcode
        });
        
        if (shelf && shelf.drawers) {
            const drawer = shelf.drawers.find(d => d.barcode === barcode);
            if (drawer) {
                const ledIndex = parseInt(drawer.ledIndex) + 1; 
                await insertDeviceCommand(db, 'hardware_commands', {
                    systemId: new ObjectId(systemId),
                    drawer_ids: [ledIndex],
                    color: "blue",
                    mode: "solid",
                    status: "pending",
                    createdAt: new Date()
                });
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error("Fehler in triggerSingleLedBlue:", error);
        throw error;
    }
}
// Anzahl der Lager, die ein Nutzer selbst erstellt hat
async function countSystemsCreatedBy(userId) {
    const db = await getDb();
    return await db.collection('systems').countDocuments({ createdBy: new ObjectId(userId) });
}

// Neues Lager anlegen – der Ersteller wird automatisch Administrator
async function createSystem(userId, name, color = '#3b82f6') {
    const db = await getDb();
    const result = await db.collection('systems').insertOne({
        name,
        createdBy: new ObjectId(userId),
        createdAt: new Date()
    });
    await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { $push: { systems: { systemId: result.insertedId, role: 'admin', color } } }
    );
    return result.insertedId.toString();
}

// Alle Lager (für den täglichen Mindestbestand-Hinweis)
async function listAllSystems() {
    const db = await getDb();
    const systems = await db.collection('systems').find({}, { projection: { name: 1, lowStockNotified: 1 } }).toArray();
    return systems.map(s => ({ ...s, _id: s._id.toString(), lowStockNotified: s.lowStockNotified || [] }));
}

// E-Mail-Adressen der Administratoren eines Lagers (nur bestätigte Konten)
async function getSystemAdminEmails(systemId) {
    const db = await getDb();
    const users = await db.collection('users').find(
        { systems: { $elemMatch: { systemId: new ObjectId(systemId), role: 'admin' } }, email: { $type: 'string' }, isVerified: { $ne: false } },
        { projection: { email: 1 } }
    ).toArray();
    return users.map(u => u.email);
}

// Merkt sich, für welche Artikel bereits ein Hinweis verschickt wurde (keine doppelten Mails)
async function setLowStockNotified(systemId, articleIds) {
    const db = await getDb();
    await db.collection('systems').updateOne({ _id: new ObjectId(systemId) }, { $set: { lowStockNotified: articleIds, lowStockCheckedAt: new Date() } });
}

// Wird ein Bild noch von irgendeinem Artikel verwendet? (z.B. nach dem Kopieren eines Artikels)
async function isImageInUse(url) {
    const db = await getDb();
    const used = await db.collection('articles').findOne({ $or: [{ images: url }, { imagePath: url }] }, { projection: { _id: 1 } });
    return !!used;
}

// Alle Bild-URLs der Artikel eines Lagers (für das Aufräumen bei Cloudinary)
async function getSystemImageUrls(systemId) {
    const db = await getDb();
    const articles = await db.collection('articles')
        .find({ systemId: new ObjectId(systemId) }, { projection: { images: 1, imagePath: 1 } })
        .toArray();
    return articles.flatMap(a => [...(Array.isArray(a.images) ? a.images : []), a.imagePath]).filter(Boolean);
}

// Löscht ein Lager mit allen zugehörigen Daten.
// Mitglieder verlieren den Zugriff; lokale Konten (ohne E-Mail), die nur zu diesem Lager gehören, werden gelöscht.
async function deleteSystemCompletely(systemId) {
    const db = await getDb();
    const id = new ObjectId(systemId);
    const bySystem = { systemId: id };

    await Promise.all([
        db.collection('articles').deleteMany(bySystem),
        db.collection('categories').deleteMany(bySystem),
        db.collection('filter_attributes').deleteMany(bySystem),
        db.collection('shelves').deleteMany(bySystem),
        db.collection('hardware_commands').deleteMany(bySystem),
        db.collection('scale_requests').deleteMany(bySystem),
        db.collection('invitations').deleteMany(bySystem),
        db.collection('stock_movements').deleteMany(bySystem),
        db.collection('projects').deleteMany(bySystem),
        db.collection('project_bookings').deleteMany(bySystem),
        db.collection('orders').deleteMany(bySystem),
        db.collection('photo_sessions').deleteMany(bySystem),
        db.collection('photo_session_images').deleteMany(bySystem),
        // Kopplungen speichern die System-ID als Text
        db.collection('device_pairings').deleteMany({ systemId: systemId.toString() }),
        // Terminals erfahren per MQTT, dass sie nicht mehr gekoppelt sind
        import('./devices.js').then(({ removeSystemDevices }) => removeSystemDevices(id))
    ]);

    // Lokale Konten nur dieses Lagers komplett entfernen (inkl. ihrer Sessions)
    const localUsers = await db.collection('users').find({
        'systems.systemId': id,
        $or: [{ email: null }, { email: { $exists: false } }],
        systems: { $size: 1 }
    }, { projection: { _id: 1 } }).toArray();
    if (localUsers.length > 0) {
        const ids = localUsers.map(u => u._id);
        await db.collection('sessions').deleteMany({ userId: { $in: ids } });
        await db.collection('users').deleteMany({ _id: { $in: ids } });
    }

    // Alle übrigen Mitglieder verlieren den Zugriff
    await db.collection('users').updateMany({ 'systems.systemId': id }, { $pull: { systems: { systemId: id } } });
    await db.collection('systems').deleteOne({ _id: id });
}

// Mehrere Lager in EINER Abfrage laden (statt einer Abfrage pro Lager)
async function getSystemsByIds(ids) {
    const validIds = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
    if (validIds.length === 0) return [];
    const db = await getDb();
    const systems = await db.collection('systems')
        .find({ _id: { $in: validIds } }, { projection: { name: 1, roles: 1, createdBy: 1, features: 1 } })
        .toArray();
    return systems.map(s => ({ ...s, _id: s._id.toString(), createdBy: s.createdBy?.toString() || null }));
}

async function getSystemById(id) {
    try {
        const db = await getDb();
        const system = await db.collection("systems").findOne({ _id: new ObjectId(id) });
        if (system && system._id) system._id = system._id.toString();
        return system;
    } catch (error) {
        console.error("Fehler beim Laden des Systems:", error);
        return null;
    }
}

export async function removeUserFromSystem(systemId, userId) {
    const db = await getDb();
    await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { $pull: { systems: { systemId: new ObjectId(systemId) } } }
    );
    return { success: true };
}

export async function getInvitationsBySystem(systemId) {
    const db = await getDb();
    const invites = await db.collection('invitations').find({
        systemId: new ObjectId(systemId),
        status: 'pending',
        expiresAt: { $gt: new Date() } // Nur Einladungen, die noch nicht abgelaufen sind
    }).toArray();

    return invites.map(inv => ({
        id: inv._id.toString(),
        email: inv.email,
        role: inv.role,
        createdAt: inv.createdAt.toISOString(),
        expiresAt: inv.expiresAt.toISOString()
    }));
}

// 1. Alle aktuellen Nutzer eines Lagers abrufen
export async function getUsersBySystem(systemId) {
    const db = await getDb();
    const systemObjId = new ObjectId(systemId);
    
    // Wir suchen alle User, die diese systemId in ihrem systems-Array haben.
    // Das .map() lassen wir komplett weg, da deine +page.server.js das 
    // bereits perfekt und sicher übernimmt!
    return await db.collection('users').find(
        { "systems.systemId": systemObjId },
        { projection: { password: 0, verificationCode: 0, verificationToken: 0 } } 
    ).toArray();
}

// 2. Eine neue Einladung erstellen
export async function createSystemInvitation(systemId, email, role, inviterName) {
    const db = await getDb();
    
    // Prüfen, ob der User vielleicht schon im Lager ist
    const existingUser = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (existingUser && existingUser.systems) {
        const alreadyInSystem = existingUser.systems.some(s => s.systemId.toString() === systemId.toString());
        if (alreadyInSystem) return { success: false, message: 'Nutzer ist bereits in diesem Lager.' };
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 Tage gültig

    await db.collection('invitations').insertOne({
        systemId: new ObjectId(systemId),
        email: email.toLowerCase(),
        role: role,
        inviterName: inviterName,
        token: token,
        expiresAt: expiresAt,
        createdAt: new Date(),
        status: 'pending' // pending, accepted, expired
    });

    return { success: true, token: token };
}

// 8. Lokalen Nutzer (ohne E-Mail) direkt anlegen
export async function createLocalUser(systemId, username, firstName, lastName, initialPassword, role) {
    const db = await getDb();
    
    // Prüfen, ob der Benutzername schon existiert (muss systemweit eindeutig sein)
    const existingUser = await db.collection('users').findOne({ username: username.toLowerCase() });
    if (existingUser) return { success: false, message: 'Dieser Benutzername ist bereits vergeben.' };

    const hashedPassword = await bcrypt.hash(initialPassword, BCRYPT_ROUNDS);

    const newUser = {
        username: username.toLowerCase(),
        firstName: firstName,
        lastName: lastName,
        password: hashedPassword,
        isVerified: true, // Da vom Admin erstellt, ist keine Verifizierung nötig
        mustChangePassword: true, // 🔥 Zwingt zum Wechsel beim ersten Login
        createdAt: new Date(),
        systems: [{
            systemId: new ObjectId(systemId),
            role: role
        }]
    };

    await db.collection('users').insertOne(newUser);
    return { success: true };
}

// 9. Passwort durch Admin zurücksetzen (für Nutzer ohne E-Mail)
export async function resetPasswordByAdmin(userId, systemId, newPassword) {
    const db = await getDb();
    
    // Sicherheitscheck: Der Nutzer muss Teil dieses Systems sein
    const user = await db.collection('users').findOne({ 
        _id: new ObjectId(userId),
        "systems.systemId": new ObjectId(systemId)
    });
    
    if (!user) return { success: false, message: 'Nutzer nicht gefunden oder nicht im System.' };

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { 
            $set: { 
                password: hashedPassword,
                mustChangePassword: true // Nach Admin-Reset wieder zum Wechsel zwingen
            } 
        }
    );
    await deleteUserSessions(userId);

    return { success: true };
}

// 10. 2FA für einen Nutzer aktivieren
export async function enableTwoFactor(userId, secret) {
    const db = await getDb();
    await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { $set: { twoFactorSecret: secret, isTwoFactorEnabled: true } }
    );
    return { success: true };
}

// 11. 2FA wieder deaktivieren (falls ein Mitarbeiter sein Handy verliert)
export async function disableTwoFactor(userId) {
    const db = await getDb();
    await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { $set: { twoFactorSecret: null, isTwoFactorEnabled: false } }
    );
    return { success: true };
}

async function requestEmailChange(userId, newEmail) {
    const db = await getDb();
    
    // Prüfen, ob die neue E-Mail schon von wem anders genutzt wird
    const existingUser = await db.collection('users').findOne({ email: newEmail.toLowerCase() });
    if (existingUser) return { success: false, message: 'Diese E-Mail-Adresse ist bereits vergeben.' };

    // Sicheres Token generieren (24 Stunden gültig)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); 

    await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { 
            $set: { 
                pendingEmail: newEmail.toLowerCase(), 
                emailChangeToken: token, 
                emailChangeExpires: expires 
            } 
        }
    );

    return { success: true, token: token };
}

// 13. E-Mail-Änderung bestätigen (Token einlösen)
export async function confirmEmailChange(token) {
    const db = await getDb();
    
    const user = await db.collection('users').findOne({
        emailChangeToken: token,
        emailChangeExpires: { $gt: new Date() } // Darf nicht abgelaufen sein
    });

    if (!user) return { success: false, message: 'Der Link ist ungültig oder abgelaufen.' };

    // Alte Mail überschreiben und die temporären Felder löschen
    await db.collection('users').updateOne(
        { _id: user._id },
        {
            $set: { email: user.pendingEmail },
            $unset: { pendingEmail: "", emailChangeToken: "", emailChangeExpires: "" }
        }
    );

    return { success: true };
}

// 14. Passwort-Änderung beantragen
export async function requestPasswordChange(userId, hashedNewPassword) {
    const db = await getDb();
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 2 * 60 * 60 * 1000); // Nur 2 Stunden gültig!

    await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { 
            $set: { 
                pendingPassword: hashedNewPassword, 
                passwordChangeToken: token, 
                passwordChangeExpires: expires 
            } 
        }
    );

    return { success: true, token: token };
}

// 15. Passwort-Änderung bestätigen (Token einlösen)
export async function confirmPasswordChange(token) {
    const db = await getDb();
    
    const user = await db.collection('users').findOne({
        passwordChangeToken: token,
        passwordChangeExpires: { $gt: new Date() }
    });

    if (!user) return { success: false, message: 'Der Link ist ungültig oder abgelaufen.' };

    // Neues Passwort scharfschalten und temporäre Felder putzen
    await db.collection('users').updateOne(
        { _id: user._id },
        {
            $set: { password: user.pendingPassword },
            $unset: { pendingPassword: "", passwordChangeToken: "", passwordChangeExpires: "" }
        }
    );
    await deleteUserSessions(user._id);

    return { success: true };
}

// =========================================================================
// SYSTEM & ROLLEN VERWALTUNG
// =========================================================================

// 1. Lokalen Benutzer (ohne E-Mail) erstellen und direkt dem System zuweisen
// 🔥 NEU: Parameter "color" hinzugefügt
async function createLocalSystemUser(systemId, username, hashedPw, role, color) {
    const db = await getDb();
    
    // Prüfen ob der Benutzername systemweit schon existiert
    const existing = await db.collection('users').findOne({ 
        username: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') } 
    });
    if (existing) return { success: false, message: 'Dieser Benutzername ist bereits vergeben.' };

    const newUser = {
        username: username,
        email: null, // Lokale User haben keine Mail
        password: hashedPw,
        // 🔥 NEU: color wird im systems-Array mit abgespeichert
        systems: [{ systemId: new ObjectId(systemId), role: role, color: color }], 
        mustChangePassword: true, // Zwingt zum Wechsel beim 1. Login
        isTwoFactorEnabled: false,
        createdAt: new Date(),
        isVerified: true // Lokale User gelten durch Admin-Erstellung als verifiziert
    };

    const result = await db.collection('users').insertOne(newUser);
    return { success: true, userId: result.insertedId };
}

// 2. Bestehenden E-Mail-User zum System hinzufügen
// 🔥 NEU: Parameter "color" hinzugefügt
async function addUserToSystem(systemId, email, role, color) {
    const db = await getDb();
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    
    if (!user) {
        // HINWEIS: Hier kommt später die Logik für "Pending Invites" rein, 
        // falls die Mailadresse noch gar kein Sortify-Konto hat.
        return { success: false, notFound: true, message: 'Es existiert noch kein Konto mit dieser E-Mail.' };
    }

    // Prüfen, ob die Person schon im System ist
    const alreadyInSystem = user.systems?.some(s => s.systemId.toString() === systemId);
    if (alreadyInSystem) return { success: false, message: 'Benutzer ist bereits in diesem Lager.' };

    // Zum Array hinzufügen
    await db.collection('users').updateOne(
        { _id: user._id },
        // 🔥 NEU: color wird mit in das $push-Objekt aufgenommen
        { $push: { systems: { systemId: new ObjectId(systemId), role: role, color: color } } }
    );

    return { success: true, user: user };
}

// 3. Bestehendes Konto per E-Mail zum System hinzufügen
// Unbekannte Adressen müssen sich zuerst selbst registrieren (es werden keine Konten ohne Passwort angelegt)
async function inviteUserToSystem(systemId, email, role, color = '#3b82f6') {
    const db = await getDb();
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });

    if (!user) {
        return {
            success: false,
            message: 'Zu dieser E-Mail-Adresse gibt es noch kein Konto. Bitte die Person, sich zuerst zu registrieren – danach kannst du sie hier hinzufügen.'
        };
    }

    // Prüfen, ob der Nutzer schon im System ist
    if (user.systems?.some(s => s.systemId.toString() === systemId.toString())) {
        return { success: false, message: 'Dieser Benutzer ist bereits Teil des Systems.' };
    }

    await db.collection('users').updateOne(
        { _id: user._id },
        { $push: { systems: { systemId: new ObjectId(systemId), role, color } } }
    );
    return { success: true, status: 'existing_added' };
}

async function changePasswordDirectly(userId, hashedPassword) {
    const db = await getDb();
    
    await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { 
            $set: { password: hashedPassword, mustChangePassword: false },
            $unset: { pendingPassword: "", passwordChangeToken: "", passwordChangeExpires: "" }
        }
    );

    return { success: true };
}

// Rolle eines Benutzers in einem bestimmten System ändern
async function updateUserSystemRole(systemId, userId, newRole) {
    const db = await getDb();
    
    await db.collection('users').updateOne(
        { 
            _id: new ObjectId(userId), 
            "systems.systemId": new ObjectId(systemId) 
        },
        { 
            $set: { "systems.$.role": newRole } 
        }
    );
    
    return { success: true };
}


// Speichert einen temporären 2FA-Notfallcode (gültig für 15 Minuten)
async function set2FABackupCode(userId, code) {
    const db = await getDb();
    const expires = new Date(Date.now() + 15 * 60000); // 15 Minuten in der Zukunft
    
    await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { $set: { backupCode: code, backupCodeExpires: expires } }
    );
    return { success: true };
}

// Prüft den Notfallcode und löscht ihn danach
async function verify2FABackupCode(userId, code) {
    if (!code) return false;
    const db = await getDb();
    // Prüfen und Löschen in einem Schritt, damit der Code garantiert nur 1x funktioniert
    const user = await db.collection('users').findOneAndUpdate(
        { _id: new ObjectId(userId), backupCode: String(code), backupCodeExpires: { $gt: new Date() } },
        { $unset: { backupCode: "", backupCodeExpires: "" } }
    );
    return !!user;
}
// ==========================================
// 7. ROLLEN- UND BERECHTIGUNGSVERWALTUNG
// ==========================================

const DEFAULT_ROLES = [
    { roleId: 'admin', name: 'Administrator', allowedRoutes: ['*'], isSystemRole: true },
    { roleId: 'user', name: 'Benutzer', allowedRoutes: ['/', '/terminal'], isSystemRole: true }
];

export async function getSystemRoles(systemId) {
    const db = await getDb();
    const system = await db.collection("systems").findOne({ _id: new ObjectId(systemId) });
    
    // Fehlende Standard-Rollen ergänzen (gespeicherte Versionen haben Vorrang)
    const storedRoles = system?.roles || [];
    const missingDefaults = DEFAULT_ROLES.filter(d => !storedRoles.some(r => r.roleId === d.roleId));
    return [...missingDefaults, ...storedRoles];
}

export async function createSystemRole(systemId, roleName, allowedRoutes, startPage) {
    const db = await getDb();
    const roleId = 'role_' + crypto.randomBytes(4).toString('hex');
    
    await db.collection("systems").updateOne(
        { _id: new ObjectId(systemId) },
        { $push: { 
            roles: { 
                roleId: roleId, 
                name: roleName, 
                allowedRoutes: allowedRoutes, 
                startPage: startPage, // 🔥 NEU: Die Startseite wird jetzt in der DB gespeichert
                isSystemRole: false // Nur benutzerdefinierte Rollen dürfen später gelöscht werden
            } 
        }}
    );
    return { success: true, roleId };
}

export async function deleteSystemRole(systemId, roleId) {
    const db = await getDb();
    
    // Verhindern, dass die System-Rollen (admin, user) gelöscht werden
    if (roleId === 'admin' || roleId === 'user') {
        return { success: false, message: "System-Rollen können nicht gelöscht werden." };
    }

    await db.collection("systems").updateOne(
        { _id: new ObjectId(systemId) },
        { $pull: { roles: { roleId: roleId } } }
    );
    return { success: true };
}
// Aktualisiert die LED-Farbe eines Benutzers für ein spezifisches System
async function updateUserSystemColor(systemId, userId, newColor) {
    const db = await getDb();
    await db.collection('users').updateOne(
        { 
            _id: new ObjectId(userId), 
            "systems.systemId": new ObjectId(systemId) 
        },
        { 
            $set: { "systems.$.color": newColor } 
        }
    );
}

// Live-Waage: Auftrag für den Raspberry Pi anlegen und SOFORT die ID zurückgeben.
// Den Status fragt der Browser über /api/scale/[id] ab – so blockiert keine Server-Funktion mehrere Sekunden.
export async function createLiveScaleRequest(systemId) {
    const db = await getDb();
    const collection = db.collection('scale_requests');

    // Alte, unbeantwortete Aufträge aufräumen, damit sich nichts verhakt
    await collection.deleteMany({ 
        systemId: new ObjectId(systemId), 
        status: { $in: ["pending", "processing"] } 
    });

    const result = await insertDeviceCommand(db, 'scale_requests', {
        systemId: new ObjectId(systemId),
        status: "pending",
        createdAt: new Date()
    });
    return result.insertedId.toString();
}

// Sendet den Kalibrierungs-Befehl und wartet, bis der Pi "done" meldet
export async function sendCalibrationCommand(systemId, commandType, weight = 0) {
    if (!systemId) throw new Error("Fehlende System-ID.");
    const db = await getDb();
    
    const hwCollection = db.collection('hardware_commands');
    const scaleCollection = db.collection('scale_requests');

    let safeCommand = commandType;
    if (commandType === 'zero') safeCommand = 'calibrate_zero';
    if (commandType === 'ratio') safeCommand = 'calibrate_ratio';

    const payload = {
        systemId: typeof systemId === 'string' ? new ObjectId(systemId) : systemId,
        command: safeCommand,
        weight: Number(weight) || 0,
        status: "pending",
        createdAt: new Date()
    };

    // Neue Terminals erhalten den Auftrag einmal (per MQTT, Rückmeldung über scale_requests),
    // ältere lesen eines der beiden Dokumente direkt aus der Datenbank
    const hwResult = await insertDeviceCommand(db, 'hardware_commands', { ...payload }, { dispatch: false });
    const scaleResult = await insertDeviceCommand(db, 'scale_requests', { ...payload });

    let sawProcessing = false;

    // Wir lauschen jetzt ganz genau, was der Pi in der Datenbank macht
    for (let i = 0; i < 40; i++) { 
        await new Promise(resolve => setTimeout(resolve, 250));

        const docHw = await hwCollection.findOne({ _id: hwResult.insertedId });
        const docScale = await scaleCollection.findOne({ _id: scaleResult.insertedId });

        // Wenn der Status auf "processing" springt, wissen wir, der Pi hat es gelesen!
        if ((docHw && docHw.status === "processing") || (docScale && docScale.status === "processing")) {
            sawProcessing = true;
        }

        if (docHw && docHw.status === "done") {
            await hwCollection.deleteOne({ _id: hwResult.insertedId });
            await scaleCollection.deleteOne({ _id: scaleResult.insertedId });
            return true;
        }

        if (docScale && docScale.status === "done") {
            await hwCollection.deleteOne({ _id: hwResult.insertedId });
            await scaleCollection.deleteOne({ _id: scaleResult.insertedId });
            return true;
        }
    }

    // Diagnose für die Logs: Hat der Pi den Befehl überhaupt gesehen?
    console.warn(sawProcessing
        ? `[Kalibrierung] Timeout (System ${systemId}): Terminal hat den Befehl angenommen, aber nicht abgeschlossen – Waage/HX711-Verkabelung am Pi prüfen.`
        : `[Kalibrierung] Timeout (System ${systemId}): Terminal hat den Befehl nicht abgeholt – System-ID oder DB-Verbindung des Pi prüfen.`);

    await hwCollection.deleteOne({ _id: hwResult.insertedId });
    await scaleCollection.deleteOne({ _id: scaleResult.insertedId });
    throw new Error("Timeout: Das Terminal antwortet nicht.");
}

export default { 
    getDb,
    getCategories, 
    createMainCategory,
    createSubcategory,
    deleteSubcategory,
    deleteMainCategory, 
    renameMainCategory,
    renameSubcategory,
    updateSubcategoryAttributes,
    getFilterAttributes, 
    createFilterAttribute,
    deleteFilterAttribute,
    updateFilterAttribute,
    getFilterAttributeByLabel,
    addOptionToFilterAttribute,
    removeOptionFromFilterAttribute,
    createArticle,
    getArticles,
    getArticleById,
    updateArticle,
    deleteArticle,
    getUserByIdentifier,
    createInitialUser,
    getUserById,
    updateUser,
    verifyUser,
    getLoginAttempt,
    upsertLoginAttempt,
    deleteLoginAttempt,
    createSessionLog,
    endSessionLog,
    rateLimit,
    createSession,
    getSession,
    incrementSessionAttempts,
    deleteSession,
    deleteUserSessions,
    touchSession,
    listUserSessions,
    deleteUserSessionById,
    savePasswordResetToken,
    getUserByResetToken,
    resetUserPassword,
    renewVerificationData,
    createHardwareCommand,
    getShelves,
    createNewShelf,
    updateDrawerBarcode,
    deleteShelf,
    assignBarcodeToArticle,
    checkIfBarcodeExists,
    triggerLedByBarcode,
    getArticleByBarcode,
    createScaleRequest,
    getScaleRequest,
    updateArticleStock,
    assignBarcodeAndWeights,
    getDrawerByBarcode,
    updateArticleStockFromWeights,
    setDrawerStock,
    findArticlesByGtin,
    removeBarcodes,
    logArticleAction,
    updateArticleItemWeight,
    triggerEmptyLedsBlue,
    triggerSingleLedBlue,
    getSystemById,
    getSystemsByIds,
    isImageInUse,
    getStockMovements,
    getTopConsumption,
    listAllSystems,
    getSystemAdminEmails,
    setLowStockNotified,
    getSystemImageUrls,
    deleteSystemCompletely,
    createSystem,
    countSystemsCreatedBy,
    createSystemInvitation,
    getInvitationsBySystem,
    enableTwoFactor,
    disableTwoFactor,
    requestEmailChange,
    confirmEmailChange,
    requestPasswordChange,
    confirmPasswordChange,
    createLocalSystemUser,
    addUserToSystem,
    inviteUserToSystem,
    getUsersBySystem,
    changePasswordDirectly,
    updateUserSystemRole,
    removeUserFromSystem,
    set2FABackupCode,
    verify2FABackupCode,
    getSystemRoles,
    createSystemRole,
    deleteSystemRole,
    updateUserSystemColor,
    createLiveScaleRequest,
    sendCalibrationCommand,
    triggerLedsByBarcodeArray
};