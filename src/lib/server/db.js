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
        const dataToInsert = { ...articleData, userId: userId };
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
        const collection = db.collection("articles");
        articles = await collection.find({ userId: userId }).sort({ createdAt: -1 }).toArray();
        
        articles.forEach(article => {
            if (article._id) article._id = article._id.toString();
            if (article.mainCategoryId) article.mainCategoryId = article.mainCategoryId.toString();
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

async function createHardwareCommand(userId, command) {
    try {
        const db = await getDb();
        const commandsCollection = db.collection('hardware_commands');

        // Wenn der Befehl 0 ist (Ausschalten), leiten wir ihn direkt weiter.
        // Die Hardware erkennt 0 oder -1 als Signal, alle LEDs zu löschen.
        await commandsCollection.insertOne({
            userId: userId.toString(),
            drawer_id: parseInt(command),
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

        // Mandantenfähigkeit: Strikt nach userId filtern.
        // WICHTIG: Wir sortieren nach start_index (aufsteigend: 1), 
        // damit SvelteKit immer das physisch letzte Regal am Ende des Arrays findet.
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

        // Das Regal wird erstellt und die Verknüpfung (LED <-> Barcode) 
        // wird direkt im Regal als 'drawers' gespeichert.
        const newShelf = {
            userId: userId.toString(),
            name: shelfName,
            start_index: parseInt(startIndex),
            drawer_count: parseInt(drawerCount),
            drawers: barcodes, // Das komplette Mapping vom Anlern-Assistenten!
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

        // Der $ Operator sucht in dem Array 'drawers' genau das Element, 
        // das auf die Suchbedingung (ledIndex) zutrifft, und überschreibt dessen Barcode.
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

        // Löscht das Regal, das zur ID und zum User passt
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

        // Überschreibt oder setzt das Feld 'assigned_barcode' beim jeweiligen Artikel
        await collection.updateOne(
            { 
                _id: new ObjectId(articleId), 
                userId: userId.toString() 
            },
            { 
                $set: { 
                    assigned_barcode: barcode,
                    updatedAt: new Date()
                } 
            }
        );
        return true;
    } catch (error) {
        console.error("Fehler beim Verknüpfen des Artikels:", error);
        throw error;
    }
}

// Prüft, ob ein Barcode physisch in den Regalen angelernt wurde
async function checkIfBarcodeExists(userId, barcode) {
    try {
        const db = await getDb();
        const collection = db.collection('shelves');

        // Sucht nach einem Regal des Users, das diesen Barcode in seinem 'drawers' Array hat
        const shelf = await collection.findOne({
            userId: userId.toString(),
            "drawers.barcode": barcode
        });

        // Wenn shelf existiert, gibt es 'true' zurück, ansonsten 'false'
        return !!shelf; 
    } catch (error) {
        console.error("Fehler beim Prüfen des Barcodes:", error);
        return false;
    }
}

// Sucht den ledIndex zum Barcode und feuert den Befehl ans Raspberry Pi
async function triggerLedByBarcode(userId, barcode) {
    try {
        const db = await getDb();
        const shelvesCollection = db.collection('shelves');

        // 1. Suche das Regal, das dieses Fach besitzt
        const shelf = await shelvesCollection.findOne({
            userId: userId.toString(),
            "drawers.barcode": barcode
        });

        if (!shelf) {
            throw new Error("Kein Regal mit diesem Barcode gefunden.");
        }

        // 2. Extrahiere den genauen ledIndex aus dem Regal
        const drawer = shelf.drawers.find(d => d.barcode === barcode);
        if (!drawer) {
            throw new Error("Fach im Regal nicht gefunden.");
        }

        // WICHTIGER FIX: Da die Hardware led_index = drawer_id - 1 rechnet,
        // müssen wir hier im Backend den ledIndex um 1 erhöhen!
        const targetDrawerId = parseInt(drawer.ledIndex) + 1;

        // 3. Neuen Befehl als "pending" in die Warteschlange einreihen
        const commandsCollection = db.collection('hardware_commands');
        await commandsCollection.insertOne({
            userId: userId.toString(),
            drawer_id: targetDrawerId,
            status: "pending",
            createdAt: new Date() // Erzeugt das korrekte BSON-Date-Format (UTC)
        });

        return drawer.ledIndex; 
    } catch (error) {
        console.error("Fehler in triggerLedByBarcode:", error);
        throw error;
    }
}
export default { 
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
    triggerLedByBarcode
};