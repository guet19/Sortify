import crypto from 'crypto';
import { randomUUID } from 'crypto'; // Falls du Node.js nutzt, ansonsten crypto.randomUUID() verwenden
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
        const subId = "sub_" + Date.now(); 
        const result = await collection.updateOne(
            { _id: new ObjectId(mainCategoryId), systemId: new ObjectId(systemId) },
            { $push: { subcategories: { id: subId, name: subName, allowed_attributes: [] } } }
        );
        return result;
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
            label: { $regex: new RegExp(`^${label}$`, 'i') } 
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

async function createArticle(systemId, articleData) {
    try {
        const db = await getDb();
        const collection = db.collection("articles");
        // Initialisiere assigned_barcodes immer als leeres Array!
        const dataToInsert = { ...articleData, systemId: new ObjectId(systemId), assigned_barcodes: [] };
        const result = await collection.insertOne(dataToInsert);
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

async function updateArticle(systemId, id, updateData) {
    try {
        const db = await getDb();
        const collection = db.collection("articles");
        const result = await collection.updateOne(
            { _id: new ObjectId(id), systemId: new ObjectId(systemId) },
            { $set: updateData }
        );
        return result;
    } catch (error) {
        console.error("Fehler beim Aktualisieren des Artikels:", error);
        throw error;
    }
}

async function deleteArticle(systemId, id) {
    try {
        const db = await getDb();
        const collection = db.collection("articles");
        const result = await collection.deleteOne({ 
            _id: new ObjectId(id), 
            systemId: new ObjectId(systemId) 
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

async function createHardwareCommand(systemId, command) {
    try {
        const db = await getDb();
        const commandsCollection = db.collection('hardware_commands');

        let commandArray = Array.isArray(command) ? command : [parseInt(command)];

        await commandsCollection.insertOne({
            systemId: new ObjectId(systemId),
            drawer_ids: commandArray, 
            status: "pending",
            createdAt: new Date()
        });

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

async function triggerLedByBarcode(systemId, barcode, singleOnly = false) {
    try {
        const db = await getDb();
        
        // 1. Artikel finden
        const article = await db.collection('articles').findOne({ 
            systemId: new ObjectId(systemId), 
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
            barcodesToLightUp = [barcode];
        } else {
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
            await db.collection('hardware_commands').insertOne({
                systemId: new ObjectId(systemId),
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
    const result = await db.collection('scale_requests').insertOne({
        systemId: new ObjectId(systemId),
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

async function updateArticleStock(systemId, articleId, newStock) {
    const db = await getDb();
    await db.collection('articles').updateOne(
        { _id: new ObjectId(articleId), systemId: new ObjectId(systemId) },
        { $set: { istBestand: newStock } }
    );
}

async function assignBarcodeAndWeights(systemId, articleId, barcode, boxWeight, itemWeight) {
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

async function updateArticleStockFromWeights(systemId, articleId, barcode, newStock) {
    try {
        const db = await getDb();
        const article = await db.collection('articles').findOne({ 
            _id: new ObjectId(articleId), 
            systemId: new ObjectId(systemId) 
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
            barcodes[targetBarcodeIndex].lastWeighedAt = new Date(); 
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
                },
                $unset: { assigned_barcode: "" } 
            }
        );

    } catch (error) {
        console.error("Fehler bei updateArticleStockFromWeights:", error);
        throw error;
    }
}
async function removeBarcodes(systemId, articleId, barcodeToRemove = null) {
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

async function triggerEmptyLedsBlue(systemId) {
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

        const articles = await db.collection('articles').find({ systemId: new ObjectId(systemId) }).toArray();
        let assignedBarcodes = new Set();
        articles.forEach(article => {
            if (Array.isArray(article.assigned_barcodes)) {
                article.assigned_barcodes.forEach(b => {
                    const code = typeof b === 'object' ? b.barcode : b;
                    if (code) assignedBarcodes.add(code);
                });
            } else if (article.assigned_barcode) {
                assignedBarcodes.add(article.assigned_barcode);
            }
        });

        let emptyDrawerIds = [];
        allDrawers.forEach(drawer => {
            if (!assignedBarcodes.has(drawer.barcode)) {
                emptyDrawerIds.push(parseInt(drawer.ledIndex) + 1); 
            }
        });

        if (emptyDrawerIds.length > 0) {
            await db.collection('hardware_commands').insertOne({
                systemId: new ObjectId(systemId),
                drawer_ids: emptyDrawerIds,
                color: "blue",     
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
                await db.collection('hardware_commands').insertOne({
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

    const hashedPassword = await bcrypt.hash(initialPassword, 10);

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

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { 
            $set: { 
                password: hashedPassword,
                mustChangePassword: true // Nach Admin-Reset wieder zum Wechsel zwingen
            } 
        }
    );

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

    return { success: true };
}

// =========================================================================
// SYSTEM & ROLLEN VERWALTUNG
// =========================================================================

// 1. Lokalen Benutzer (ohne E-Mail) erstellen und direkt dem System zuweisen
async function createLocalSystemUser(systemId, username, hashedPw, role) {
    const db = await getDb();
    
    // Prüfen ob der Benutzername systemweit schon existiert
    const existing = await db.collection('users').findOne({ 
        username: { $regex: new RegExp(`^${username}$`, 'i') } 
    });
    if (existing) return { success: false, message: 'Dieser Benutzername ist bereits vergeben.' };

    const newUser = {
        username: username,
        email: null, // Lokale User haben keine Mail
        password: hashedPw,
        systems: [{ systemId: new ObjectId(systemId), role: role }],
        mustChangePassword: true, // 🔥 Zwingt zum Wechsel beim 1. Login
        isTwoFactorEnabled: false,
        createdAt: new Date(),
        isVerified: true // Lokale User gelten durch Admin-Erstellung als verifiziert
    };

    const result = await db.collection('users').insertOne(newUser);
    return { success: true, userId: result.insertedId };
}

// 2. Bestehenden E-Mail-User zum System hinzufügen
async function addUserToSystem(systemId, email, role) {
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
        { $push: { systems: { systemId: new ObjectId(systemId), role: role } } }
    );

    return { success: true, user: user };
}

// 3. Benutzer per E-Mail einladen (Shell-Account Logik)
async function inviteUserToSystem(systemId, email, role) {
    const db = await getDb();
    const lowerEmail = email.toLowerCase();
    
    // Prüfen, ob die Mail schon registriert ist
    let user = await db.collection('users').findOne({ email: lowerEmail });
    
    if (user) {
        // Prüfen, ob der Nutzer schon im System ist
        if (user.systems?.some(s => s.systemId.toString() === systemId)) {
            return { success: false, message: 'Dieser Benutzer ist bereits Teil des Systems.' };
        }
        
        // Fügt das System zum bestehenden Account hinzu
        await db.collection('users').updateOne(
            { _id: user._id },
            { $push: { systems: { systemId: new ObjectId(systemId), role: role } } }
        );
        return { success: true, status: 'existing_added' };
    } else {
        // Shell-Account für neuen Nutzer erstellen
        const inviteToken = crypto.randomBytes(32).toString('hex');
        const shellUser = {
            email: lowerEmail,
            username: null, // Wird bei der Registrierung gesetzt
            password: null, // Wird vom Nutzer selbst gesetzt
            systems: [{ systemId: new ObjectId(systemId), role: role }],
            isVerified: false,
            inviteToken: inviteToken,
            createdAt: new Date()
        };
        
        await db.collection('users').insertOne(shellUser);
        return { success: true, status: 'new_invited', token: inviteToken };
    }
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
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    
    if (user && user.backupCode === code && user.backupCodeExpires > new Date()) {
        // Code ist gültig -> Direkt wieder aus der DB löschen, damit er nur 1x funktioniert
        await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            { $unset: { backupCode: "", backupCodeExpires: "" } }
        );
        return true;
    }
    return false;
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
    updateArticleItemWeight,
    triggerEmptyLedsBlue,
    triggerSingleLedBlue,
    getSystemById,
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
    verify2FABackupCode

    
};