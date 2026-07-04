import crypto from 'crypto';
import { MongoClient, ObjectId } from "mongodb";
// ÄNDERUNG: Wir nutzen den dynamischen Import, der ist sicherer für Netlify!
import { env } from '$env/dynamic/private';
import bcrypt from "bcryptjs"; 

// ==========================================
// 0. SERVERLESS CONNECTION POOLING
// ==========================================
let client;
let clientPromise;

if (!global._mongoClientPromise) {
    // ÄNDERUNG: Hier greifen wir auf env.DB_URI zu
    client = new MongoClient(env.DB_URI);
    global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

// Hilfsfunktion: Holt die gecachte Verbindung
async function getDb() {
    const connectedClient = await clientPromise;
    // Hinweis: Dein Cluster in Atlas heisst "Storify", deshalb bleibt das hier so, 
    // auch wenn das Projekt Sortify heisst. Das passt!
    return connectedClient.db("Storify"); 
}


// ==========================================
// 1. KATEGORIEN VERWALTUNG
// ==========================================

async function getCategories(userId) {
    let categories = [];
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        categories = await collection.find({ userId: userId }).toArray();
        categories.forEach(cat => {
            if (cat._id) cat._id = cat._id.toString();
        });
    } catch (error) {
        console.error("Fehler beim Laden der Kategorien:", error);
    }
    return categories;
}

async function createMainCategory(userId, name) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const result = await collection.insertOne({
            userId: userId, 
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

async function createSubcategory(userId, mainCategoryId, subName) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const subId = "sub_" + Date.now(); 
        const result = await collection.updateOne(
            { _id: new ObjectId(mainCategoryId), userId: userId },
            { $push: { subcategories: { id: subId, name: subName, allowed_attributes: [] } } }
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Speichern der Unterkategorie:", error);
        throw error;
    }
}

async function deleteSubcategory(userId, mainCategoryId, subCategoryId) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const result = await collection.updateOne(
            { _id: new ObjectId(mainCategoryId), userId: userId },
            { $pull: { subcategories: { id: subCategoryId } } }
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Löschen der Unterkategorie:", error);
        throw error;
    }
}

async function deleteMainCategory(userId, id) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const result = await collection.deleteOne({ _id: new ObjectId(id), userId: userId });
        return result;
    } catch (error) {
        console.error("Fehler beim Löschen der Hauptkategorie:", error);
        throw error;
    }
}

async function renameMainCategory(userId, id, newName) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const result = await collection.updateOne(
            { _id: new ObjectId(id), userId: userId },
            { $set: { name: newName } }
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Umbenennen der Hauptkategorie:", error);
        throw error;
    }
}

async function renameSubcategory(userId, mainCategoryId, subCategoryId, newName) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const result = await collection.updateOne(
            { _id: new ObjectId(mainCategoryId), userId: userId, "subcategories.id": subCategoryId },
            { $set: { "subcategories.$.name": newName } }
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Umbenennen der Unterkategorie:", error);
        throw error;
    }
}

async function updateSubcategoryAttributes(userId, mainCategoryId, subCategoryId, attributeIds) {
    try {
        const db = await getDb();
        const collection = db.collection("categories");
        const result = await collection.updateOne(
            { _id: new ObjectId(mainCategoryId), userId: userId, "subcategories.id": subCategoryId },
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

async function getFilterAttributes(userId) {
    let attributes = [];
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        attributes = await collection.find({ userId: userId }).toArray();
        attributes.forEach(attr => {
            if (attr._id) attr._id = attr._id.toString();
        });
    } catch (error) {
        console.error("Fehler beim Laden der Attribute:", error);
    }
    return attributes;
}

async function createFilterAttribute(userId, attributeData) {
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        const dataToInsert = { ...attributeData, userId: userId };
        const result = await collection.insertOne(dataToInsert);
        return result;
    } catch (error) {
        console.error("Fehler beim Speichern des Attributs:", error);
        throw error; 
    }
}

async function deleteFilterAttribute(userId, id) {
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        const result = await collection.deleteOne({ _id: new ObjectId(id), userId: userId });
        return result;
    } catch (error) {
        console.error("Fehler beim Löschen des Attributs:", error);
        throw error;
    }
}

async function updateFilterAttribute(userId, id, attributeData) {
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        const result = await collection.updateOne(
            { _id: new ObjectId(id), userId: userId },
            { $set: attributeData } 
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Updaten des Attributs:", error);
        throw error;
    }
}

async function getFilterAttributeByLabel(userId, label) {
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        const attribute = await collection.findOne({ 
            userId: userId,
            label: { $regex: new RegExp(`^${label}$`, 'i') } 
        });
        if (attribute && attribute._id) attribute._id = attribute._id.toString();
        return attribute;
    } catch (error) {
        console.error("Fehler bei der Label-Prüfung:", error);
        return null;
    }
}

async function addOptionToFilterAttribute(userId, id, newOption) {
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        const result = await collection.updateOne(
            { _id: new ObjectId(id), userId: userId },
            { $addToSet: { options: newOption } } 
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Quick-Add:", error);
        throw error;
    }
}

async function removeOptionFromFilterAttribute(userId, id, optionToRemove) {
    try {
        const db = await getDb();
        const collection = db.collection("filter_attributes");
        const result = await collection.updateOne(
            { _id: new ObjectId(id), userId: userId },
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

async function createArticle(userId, articleData) {
    try {
        const db = await getDb();
        const collection = db.collection("articles");
        // Initialisiere assigned_barcodes immer als leeres Array!
        const dataToInsert = { ...articleData, userId: userId, assigned_barcodes: [] };
        const result = await collection.insertOne(dataToInsert);
        return result;
    } catch (error) {
        console.error("Fehler beim Speichern des Artikels:", error);
        throw error;
    }
}

async function getArticles(userId) {
    let articles = [];
    try {
        const db = await getDb();
        const safeUserId = userId.toString();
        
        const articlesCollection = db.collection("articles");
        articles = await articlesCollection.find({ userId: safeUserId }).sort({ createdAt: -1 }).toArray();
        
        // Kleine Schönheitskorrektur für das Frontend:
        articles.forEach(article => {
            if (article._id) article._id = article._id.toString();
            if (article.mainCategoryId) article.mainCategoryId = article.mainCategoryId.toString();
            
            // Damit das Frontend die Barcodes weiter so anzeigen kann wie bisher:
            // Wir wandeln für das UI die Objekte [{barcode: "123", stock: 9}] 
            // in ein reines String-Array ["123"] für die Suche um.
            if (Array.isArray(article.assigned_barcodes)) {
                // Falls es Objekte sind, extrahiere die Barcodes. Falls es noch alte Strings sind, behalte sie.
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

async function getArticleById(userId, id) {
    try {
        const db = await getDb();
        const collection = db.collection("articles");
        const article = await collection.findOne({ _id: new ObjectId(id), userId: userId });
        
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

async function updateArticle(userId, id, updateData) {
    try {
        const db = await getDb();
        const collection = db.collection("articles");
        const result = await collection.updateOne(
            { _id: new ObjectId(id), userId: userId },
            { $set: updateData }
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Aktualisieren des Artikels:", error);
        throw error;
    }
}

async function deleteArticle(userId, id) {
    try {
        const db = await getDb();
        const collection = db.collection("articles");
        const result = await collection.deleteOne({ 
            _id: new ObjectId(id), 
            userId: userId 
        });
        return result;
    } catch (error) {
        console.error("Fehler beim Löschen des Artikels:", error);
        throw error;
    }
}

// ==========================================
// 4. BENUTZER VERWALTUNG (BCRYPT)
// ==========================================

async function getUserByEmail(email) {
    try {
        const db = await getDb();
        const collection = db.collection("users");
        const user = await collection.findOne({ email: email });
        if (user && user._id) user._id = user._id.toString();
        return user;
    } catch (error) {
        console.error("Fehler beim Suchen des Benutzers:", error);
        return null;
    }
}

async function createInitialUser(email, plainTextPassword, userData = {}, verificationData = {}) {
    try {
        const db = await getDb();
        const collection = db.collection("users");
        const existingUser = await collection.findOne({ email: email });
        if (existingUser) return { success: false, message: "Benutzer existiert bereits" };

        const salt = await bcrypt.genSalt(10);
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
        if (user && user._id) user._id = user._id.toString();
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
            userId: new ObjectId(userId),
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

async function savePasswordResetToken(email) {
    try {
        const db = await getDb();
        const collection = db.collection("users");
        
        const cleanEmail = email.toString().toLowerCase().trim();
        const user = await collection.findOne({ 
            email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } 
        });

        if (!user) {
            console.log(`[DB] Kein Nutzer mit E-Mail ${cleanEmail} gefunden.`);
            return null; 
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000); 

        await collection.updateOne(
            { _id: user._id },
            { $set: { resetToken: token, resetExpires: expires } }
        );
        
        console.log(`[DB] Token für ${cleanEmail} erfolgreich generiert.`);
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
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(plainTextPassword, salt);

        await collection.updateOne(
            { _id: new ObjectId(userId) },
            { 
                $set: { password: hashedPassword },
                $unset: { resetToken: "", resetExpires: "" } 
            }
        );
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
        
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 15 * 60000); 

        await collection.updateOne(
            { email: email },
            { $set: { verificationCode: code, verificationToken: token, verificationExpires: expires } }
        );
        
        return { code, token };
    } catch (error) {
        console.error("Fehler beim Erneuern der Verifizierungsdaten:", error);
        return null;
    }
}

// ==========================================
// 6. HARDWARE & REGAL-VERWALTUNG
// ==========================================

async function createHardwareCommand(userId, command) {
    try {
        const db = await getDb();
        const commandsCollection = db.collection('hardware_commands');

        // NEU: Unterstützt jetzt auch das Senden von [0] um alle LEDs auszuschalten.
        let commandArray = Array.isArray(command) ? command : [parseInt(command)];

        await commandsCollection.insertOne({
            userId: userId.toString(),
            drawer_ids: commandArray, // Senden an den Pi als Array
            status: "pending",
            createdAt: new Date()
        });

        return true;
    } catch (error) {
        console.error("Fehler in createHardwareCommand:", error);
        throw error;
    }
}

async function getShelves(userId) {
    try {
        const db = await getDb();
        const collection = db.collection('shelves');

        const shelves = await collection.find({ userId: userId.toString() })
                                        .sort({ start_index: 1 })
                                        .toArray();
        return shelves;
    } catch (error) {
        console.error("Fehler beim Abrufen der Regale:", error);
        return [];
    }
}

async function createNewShelf(userId, shelfName, startIndex, drawerCount, barcodes) {
    try {
        const db = await getDb();
        const shelvesCollection = db.collection('shelves');

        const newShelf = {
            userId: userId.toString(),
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

async function updateDrawerBarcode(userId, shelfId, ledIndex, newBarcode) {
    try {
        const db = await getDb();
        const collection = db.collection('shelves');

        await collection.updateOne(
            { 
                _id: new ObjectId(shelfId), 
                userId: userId.toString(), 
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

async function deleteShelf(userId, shelfId) {
    try {
        const db = await getDb();
        const collection = db.collection('shelves');

        await collection.deleteOne({ 
            _id: new ObjectId(shelfId), 
            userId: userId.toString() 
        });
        
        return true;
    } catch (error) {
        console.error("Fehler beim Löschen des Regals:", error);
        throw error;
    }
}

async function assignBarcodeToArticle(userId, articleId, barcode) {
    try {
        const db = await getDb();
        const collection = db.collection('articles');

        // Wir entfernen hier das Array-Update, da diese Funktion meistens zum "Entfernen/Unlinken" genutzt wird
        // Falls der Barcode null ist, löschen wir ihn aus dem Array
        if (barcode === null) {
             await collection.updateOne(
                { _id: new ObjectId(articleId), userId: userId.toString() },
                { $set: { assigned_barcodes: [], updatedAt: new Date() } } // Setzt es komplett zurück
            );
        } else {
             // Für reine Tests, normalerweise nutzt der Setup-Assistent 'assignBarcodeAndWeights'
             await collection.updateOne(
                { _id: new ObjectId(articleId), userId: userId.toString() },
                { $addToSet: { assigned_barcodes: barcode }, $set: { updatedAt: new Date() } }
            );
        }
       
        return true;
    } catch (error) {
        console.error("Fehler beim Verknüpfen des Artikels:", error);
        throw error;
    }
}

async function checkIfBarcodeExists(userId, barcode) {
    try {
        const db = await getDb();
        const collection = db.collection('shelves');

        const shelf = await collection.findOne({
            userId: userId.toString(),
            "drawers.barcode": barcode
        });

        return !!shelf; 
    } catch (error) {
        console.error("Fehler beim Prüfen des Barcodes:", error);
        return false;
    }
}

// NEU: Nimmt als dritten Parameter 'singleOnly' entgegen
async function triggerLedByBarcode(userId, barcode, singleOnly = false) {
    try {
        const db = await getDb();
        
        // 1. Artikel finden
        const article = await db.collection('articles').findOne({ 
            userId: userId.toString(), 
            $or: [
                { "assigned_barcodes.barcode": barcode },
                { assigned_barcodes: barcode },
                { assigned_barcode: barcode }
            ]
        });
        
        if (!article) return 0;

        // 2. Barcodes extrahieren
        let barcodesToLightUp = [];
        
        if (singleOnly) {
            // 🔥 RETOURNIEREN-MODUS: Nur exakt diesen einen gescannten Barcode nehmen
            barcodesToLightUp = [barcode];
        } else {
            // 🔥 ENTNAHME-MODUS (Standard): Alle Barcodes des Artikels leuchten lassen
            if (Array.isArray(article.assigned_barcodes)) {
                barcodesToLightUp = article.assigned_barcodes.map(b => typeof b === 'object' ? b.barcode : b);
            } else if (article.assigned_barcode) {
                barcodesToLightUp = [article.assigned_barcode];
            }
        }

        let drawerIdsToLightUp = [];

        // 3. Suche in allen Regalen nach den passenden LED-Indizes
        const shelves = await db.collection('shelves').find({ userId: userId.toString() }).toArray();
        shelves.forEach(shelf => {
            if (!shelf.drawers) return;
            shelf.drawers.forEach(drawer => {
                if (barcodesToLightUp.includes(drawer.barcode)) {
                    drawerIdsToLightUp.push(parseInt(drawer.ledIndex) + 1); // +1 weil Raspberry 1-basiert arbeitet
                }
            });
        });

        // 4. Hardware-Befehl absetzen
        if (drawerIdsToLightUp.length > 0) {
            await db.collection('hardware_commands').insertOne({
                userId: userId.toString(),
                drawer_ids: drawerIdsToLightUp, 
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

// NEU: Sucht nun im Array `assigned_barcodes`
async function getArticleByBarcode(userId, barcode) {
    try {
        const db = await getDb();
        return await db.collection('articles').findOne({
            userId: userId.toString(),
            $or: [
                { "assigned_barcodes.barcode": barcode }, // 1. Neue Objekt-Struktur
                { assigned_barcodes: barcode },           // 2. Falls einfaches Array
                { assigned_barcode: barcode }             // 3. Alter String-Fallback
            ]
        });
    } catch (error) {
        console.error("Fehler bei getArticleByBarcode:", error);
        return null;
    }
}

async function createScaleRequest(userId, barcode) {
    const db = await getDb();
    const result = await db.collection('scale_requests').insertOne({
        userId: userId.toString(),
        barcode: barcode,
        status: 'pending',  
        weight: null,       
        createdAt: new Date()
    });
    return result.insertedId.toString();
}

async function getScaleRequest(requestId) {
    const db = await getDb();
    return await db.collection('scale_requests').findOne({ 
        _id: new ObjectId(requestId) 
    });
}

async function updateArticleStock(userId, articleId, newStock) {
    const db = await getDb();
    await db.collection('articles').updateOne(
        { _id: new ObjectId(articleId), userId: userId.toString() },
        { $set: { istBestand: newStock } }
    );
}

// NEU: Zuweisen von bis zu 3 Slots und Speicherung der Box-Gewichte
async function assignBarcodeAndWeights(userId, articleId, barcode, boxWeight, itemWeight) {
    try {
        const db = await getDb();
        const article = await db.collection('articles').findOne({ _id: new ObjectId(articleId) });
        if(!article) throw new Error("Artikel nicht gefunden");
        
        let barcodes = [];
        let oldTotalStock = parseFloat(article.istBestand) || 0;

        // Gleiche sichere Migrations-Logik!
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

        // Neues Fach hinzufügen (Limit auf 10 erhöht)
        if (!barcodes.some(b => b.barcode === barcode) && barcodes.length < 10) {
            barcodes.push({ barcode: barcode, stock: 0 });
        }

        const newTotalStock = barcodes.reduce((sum, b) => sum + (parseFloat(b.stock) || 0), 0);

        await db.collection('articles').updateOne(
            { _id: new ObjectId(articleId), userId: userId.toString() },
            { 
                $set: { 
                    assigned_barcodes: barcodes,
                    "attributes.itemWeight": parseFloat(itemWeight),
                    istBestand: newTotalStock
                },
                $unset: { assigned_barcode: "" } 
            }
        );

        await db.collection('shelves').updateOne(
            { userId: userId.toString(), "drawers.barcode": barcode },
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

async function getDrawerByBarcode(userId, barcode) {
    try {
        const db = await getDb();
        const shelf = await db.collection('shelves').findOne({
            userId: userId.toString(),
            "drawers.barcode": barcode
        });
        
        return shelf ? shelf.drawers.find(d => d.barcode === barcode) : null;
    } catch (error) {
        console.error("Fehler bei getDrawerByBarcode:", error);
        return null;
    }
}

// NEU: Kalkuliert den Gesamtbestand aus allen betroffenen Schubladen
async function updateArticleStockFromWeights(userId, articleId, barcode, newStock) {
    try {
        const db = await getDb();
        const article = await db.collection('articles').findOne({ 
            _id: new ObjectId(articleId), 
            userId: userId.toString() 
        });

        if (!article) throw new Error('Artikel nicht gefunden');

        let barcodes = Array.isArray(article.assigned_barcodes) ? article.assigned_barcodes : [];

        if (article.assigned_barcode && barcodes.length === 0) {
            barcodes.push({ barcode: article.assigned_barcode, stock: parseFloat(article.istBestand) || 0 });
        }

        barcodes = barcodes.map(b => typeof b === 'string' ? { barcode: b, stock: 0 } : b);

        const targetBarcodeIndex = barcodes.findIndex(b => b.barcode === barcode);
        
        if (targetBarcodeIndex !== -1) {
            barcodes[targetBarcodeIndex].stock = newStock;
            barcodes[targetBarcodeIndex].lastWeighedAt = new Date(); // Zeitstempel am Fach
        } else {
            barcodes.push({ barcode: barcode, stock: newStock, lastWeighedAt: new Date() });
        }

        const totalStock = barcodes.reduce((sum, b) => sum + (parseFloat(b.stock) || 0), 0);

        await db.collection('articles').updateOne(
            { _id: new ObjectId(articleId) },
            { 
                $set: { 
                    assigned_barcodes: barcodes,
                    istBestand: totalStock,
                    lastWeighedAt: new Date() 
                    // 🔥 GELÖSCHT: lastReturnedAt: new Date() 
                    // So wird der "unkontrolliert"-Timer für die anderen Fächer nicht auf 0 gesetzt!
                },
                $unset: { assigned_barcode: "" } 
            }
        );

    } catch (error) {
        console.error("Fehler bei updateArticleStockFromWeights:", error);
        throw error;
    }
}
async function removeBarcodes(userId, articleId, barcodeToRemove = null) {
    try {
        const db = await getDb();
        const article = await db.collection('articles').findOne({ _id: new ObjectId(articleId), userId: userId.toString() });
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

        // Das betroffene Fach löschen
        if (barcodeToRemove) {
            barcodes = barcodes.filter(b => b.barcode !== barcodeToRemove);
        } else {
            barcodes = []; // Alle löschen
        }

        const newTotalStock = barcodes.reduce((sum, b) => sum + (parseFloat(b.stock) || 0), 0);

        await db.collection('articles').updateOne(
            { _id: new ObjectId(articleId) },
            { 
                $set: { 
                    assigned_barcodes: barcodes,
                    istBestand: newTotalStock 
                },
                $unset: { assigned_barcode: "" } 
            }
        );
    } catch (error) {
        console.error("Fehler bei removeBarcodes:", error);
        throw error;
    }
}
async function logArticleAction(userId, articleId, actionType) {
    try {
        const db = await getDb();
        let updateFields = {};
        
        // Entscheide, welcher Zeitstempel aktualisiert wird
        if (actionType === 'return') updateFields.lastReturnedAt = new Date();
        if (actionType === 'pick') updateFields.lastPickedAt = new Date();
        if (actionType === 'weigh') updateFields.lastWeighedAt = new Date();

        await db.collection('articles').updateOne(
            { _id: new ObjectId(articleId), userId: userId.toString() },
            { $set: updateFields }
        );
    } catch (error) {
        console.error("Fehler in logArticleAction:", error);
        throw error;
    }
}

// 🔥 NEU: Aktualisiert das Stückgewicht eines Artikels
async function updateArticleItemWeight(userId, articleId, newItemWeight) {
    try {
        const db = await getDb();
        await db.collection('articles').updateOne(
            { _id: new ObjectId(articleId), userId: userId.toString() },
            { $set: { "attributes.itemWeight": newItemWeight } }
        );
    } catch (error) {
        console.error("Fehler bei updateArticleItemWeight:", error);
        throw error;
    }
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
    getUserByEmail,
    createInitialUser,
    getUserById,
    updateUser,
    verifyUser,
    getLoginAttempt,
    upsertLoginAttempt,
    deleteLoginAttempt,
    createSessionLog,
    endSessionLog,
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
    removeBarcodes,
    logArticleAction,
    updateArticleItemWeight
};