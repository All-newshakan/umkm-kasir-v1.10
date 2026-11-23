const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const OWNER_UID = "owner_uid_1";
const OWNER_EMAIL = "owner@tokoberkah.id";
const KASIR_UID = "kasir_uid_2";
const KASIR_EMAIL = "kasir@tokoberkah.id";
const STRANGER_UID = "stranger_uid_3";
const STRANGER_EMAIL = "stranger@other.id";
const STORE_ID = "store_berkah_1";

const [emulatorHost, emulatorPortStr] = (
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085"
).split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

function ts(offsetMs = 5000) {
  return new Date(Date.now() - offsetMs);
}

function makeStorePayload(created = ts(10000)) {
  return {
    ownerUid: OWNER_UID,
    memberUids: [OWNER_UID],
    memberEmails: [OWNER_EMAIL],
    name: "Toko Berkah",
    logoIconKey: "STORE",
    themePaletteKey: "EMERALD",
    address: "Jl. Merdeka No. 10",
    whatsapp: "081234567890",
    email: OWNER_EMAIL,
    ownerName: "Budi Owner",
    description: "Toko sembako modern",
    receiptFooter: "Terima kasih telah berbelanja!",
    taxPercent: 0.0,
    defaultDiscountPercent: 0.0,
    paymentGatewayProvider: "MIDTRANS",
    bankTransferInfo: "BCA 1234567890 a.n. Budi",
    createdAt: created,
    updatedAt: created,
  };
}

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  if (testEnv) await testEnv.clearFirestore();
});

test("Unauthenticated users cannot read or write any collection", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("users").doc(OWNER_UID).get());
  await assertFails(unauthDb.collection("stores").doc(STORE_ID).set(makeStorePayload()));
  await assertFails(unauthDb.collection("staffInvites").where("staffEmail", "==", KASIR_EMAIL).get());
});

test("User profile: owner-only create, partial update, cross-user denial", async () => {
  const ownerDb = testEnv.authenticatedContext(OWNER_UID, {
    email: OWNER_EMAIL,
    email_verified: true,
  }).firestore();
  const strangerDb = testEnv.authenticatedContext(STRANGER_UID, {
    email: STRANGER_EMAIL,
    email_verified: true,
  }).firestore();
  const created = ts(10000);

  await assertSucceeds(
    ownerDb.collection("users").doc(OWNER_UID).set({
      userId: OWNER_UID,
      email: OWNER_EMAIL,
      displayName: "Budi",
      activeStoreId: STORE_ID,
      role: "OWNER",
      createdAt: created,
      updatedAt: created,
    })
  );

  await assertSucceeds(
    ownerDb.collection("users").doc(OWNER_UID).update({
      displayName: "Budi Santoso",
      updatedAt: ts(1000),
    })
  );

  // Reject ghost field & cross-user read
  await assertFails(
    ownerDb.collection("users").doc(OWNER_UID).update({
      isSuperAdmin: true,
      updatedAt: ts(500),
    })
  );
  await assertFails(strangerDb.collection("users").doc(OWNER_UID).get());
});

test("Store creation, product/category CRUD, transaction checkout & stranger isolation", async () => {
  const ownerDb = testEnv.authenticatedContext(OWNER_UID, {
    email: OWNER_EMAIL,
    email_verified: true,
  }).firestore();
  const strangerDb = testEnv.authenticatedContext(STRANGER_UID, {
    email: STRANGER_EMAIL,
    email_verified: true,
  }).firestore();
  const created = ts(15000);

  await assertSucceeds(
    ownerDb.collection("stores").doc(STORE_ID).set(makeStorePayload(created))
  );

  // Add category
  await assertSucceeds(
    ownerDb.collection("stores").doc(STORE_ID).collection("categories").doc("cat_1").set({
      storeId: STORE_ID,
      ownerUid: OWNER_UID,
      memberUids: [OWNER_UID],
      memberEmails: [OWNER_EMAIL],
      name: "Sayuran",
      colorHex: "#16A34A",
      createdAt: created,
      updatedAt: created,
    })
  );

  // Add product (without @DocumentId 'id')
  await assertSucceeds(
    ownerDb.collection("stores").doc(STORE_ID).collection("products").doc("prod_1").set({
      storeId: STORE_ID,
      ownerUid: OWNER_UID,
      memberUids: [OWNER_UID],
      memberEmails: [OWNER_EMAIL],
      name: "Bawang Merah",
      categoryId: "cat_1",
      categoryName: "Sayuran",
      barcode: "8991234567890",
      costPrice: 20000,
      sellPrice: 28000,
      stock: 50,
      unit: "kg",
      minStockAlert: 5,
      createdAt: created,
      updatedAt: created,
    })
  );

  // Reject product containing forbidden @DocumentId `id` field
  await assertFails(
    ownerDb.collection("stores").doc(STORE_ID).collection("products").doc("prod_bad").set({
      id: "prod_bad",
      storeId: STORE_ID,
      ownerUid: OWNER_UID,
      memberUids: [OWNER_UID],
      memberEmails: [OWNER_EMAIL],
      name: "Invalid",
      categoryId: "cat_1",
      categoryName: "Sayuran",
      barcode: "",
      costPrice: 1000,
      sellPrice: 2000,
      stock: 10,
      unit: "pcs",
      minStockAlert: 2,
      createdAt: created,
      updatedAt: created,
    })
  );

  // Scoped list queries succeed, unfiltered fail
  await assertSucceeds(
    ownerDb
      .collection("stores")
      .doc(STORE_ID)
      .collection("products")
      .where("memberUids", "array-contains", OWNER_UID)
      .get()
  );
  await assertFails(
    strangerDb.collection("stores").doc(STORE_ID).collection("products").get()
  );
  await assertFails(
    strangerDb
      .collection("stores")
      .doc(STORE_ID)
      .collection("products")
      .where("memberUids", "array-contains", OWNER_UID)
      .get()
  );

  // Transaction creation + stock decrement
  const batch = ownerDb.batch();
  const txRef = ownerDb.collection("stores").doc(STORE_ID).collection("transactions").doc("tx_1");
  const prodRef = ownerDb.collection("stores").doc(STORE_ID).collection("products").doc("prod_1");
  batch.set(txRef, {
    storeId: STORE_ID,
    ownerUid: OWNER_UID,
    memberUids: [OWNER_UID],
    memberEmails: [OWNER_EMAIL],
    invoiceNumber: "INV-20261121-001",
    cashierUid: OWNER_UID,
    cashierName: "Budi Owner",
    note: "Meja 1",
    items: [
      {
        productId: "prod_1",
        productName: "Bawang Merah",
        categoryId: "cat_1",
        categoryName: "Sayuran",
        unit: "kg",
        quantity: 2,
        costPrice: 20000,
        sellPrice: 28000,
        lineTotal: 56000,
        lineProfit: 16000,
      },
    ],
    subtotal: 56000,
    discountAmount: 0,
    discountType: "NOMINAL",
    taxAmount: 0,
    totalAmount: 56000,
    totalCost: 40000,
    totalProfit: 16000,
    paymentMethod: "TUNAI",
    paymentStatus: "VERIFIED",
    gatewayProvider: "",
    gatewayOrderId: "",
    cashReceived: 100000,
    changeAmount: 44000,
    createdAt: ts(1000),
    updatedAt: ts(1000),
  });
  batch.update(prodRef, { stock: 48, updatedAt: ts(1000) });
  await assertSucceeds(batch.commit());

  // Reject deprecated XENDIT paymentGatewayProvider on store update
  await assertFails(
    ownerDb.collection("stores").doc(STORE_ID).update({
      paymentGatewayProvider: "XENDIT",
      updatedAt: ts(500),
    })
  );

  // Verify Midtrans VIRTUAL_ACCOUNT & EWALLET transactions succeed
  await assertSucceeds(
    ownerDb.collection("stores").doc(STORE_ID).collection("transactions").doc("tx_va").set({
      storeId: STORE_ID,
      ownerUid: OWNER_UID,
      memberUids: [OWNER_UID],
      memberEmails: [OWNER_EMAIL],
      invoiceNumber: "INV-20261121-002",
      cashierUid: OWNER_UID,
      cashierName: "Budi Owner",
      note: "VA BCA",
      items: [
        {
          productId: "prod_1",
          productName: "Bawang Merah",
          categoryId: "cat_1",
          categoryName: "Sayuran",
          unit: "kg",
          quantity: 1,
          costPrice: 20000,
          sellPrice: 28000,
          lineTotal: 28000,
          lineProfit: 8000,
        },
      ],
      subtotal: 28000,
      discountAmount: 0,
      discountType: "NOMINAL",
      taxAmount: 0,
      totalAmount: 28000,
      totalCost: 20000,
      totalProfit: 8000,
      paymentMethod: "VIRTUAL_ACCOUNT",
      paymentStatus: "VERIFIED",
      gatewayProvider: "MIDTRANS",
      gatewayOrderId: "KSR-VA-002",
      cashReceived: 28000,
      changeAmount: 0,
      createdAt: ts(500),
      updatedAt: ts(500),
    })
  );

  await assertSucceeds(
    ownerDb.collection("stores").doc(STORE_ID).collection("transactions").doc("tx_ewallet").set({
      storeId: STORE_ID,
      ownerUid: OWNER_UID,
      memberUids: [OWNER_UID],
      memberEmails: [OWNER_EMAIL],
      invoiceNumber: "INV-20261121-003",
      cashierUid: OWNER_UID,
      cashierName: "Budi Owner",
      note: "GoPay",
      items: [
        {
          productId: "prod_1",
          productName: "Bawang Merah",
          categoryId: "cat_1",
          categoryName: "Sayuran",
          unit: "kg",
          quantity: 1,
          costPrice: 20000,
          sellPrice: 28000,
          lineTotal: 28000,
          lineProfit: 8000,
        },
      ],
      subtotal: 28000,
      discountAmount: 0,
      discountType: "NOMINAL",
      taxAmount: 0,
      totalAmount: 28000,
      totalCost: 20000,
      totalProfit: 8000,
      paymentMethod: "EWALLET",
      paymentStatus: "VERIFIED",
      gatewayProvider: "MIDTRANS",
      gatewayOrderId: "KSR-EW-003",
      cashReceived: 28000,
      changeAmount: 0,
      createdAt: ts(400),
      updatedAt: ts(400),
    })
  );
});

test("Kasir invite & atomic join flow with verified email vs spoofed unverified email", async () => {
  const ownerDb = testEnv.authenticatedContext(OWNER_UID, {
    email: OWNER_EMAIL,
    email_verified: true,
  }).firestore();
  const kasirDb = testEnv.authenticatedContext(KASIR_UID, {
    email: KASIR_EMAIL,
    email_verified: true,
  }).firestore();
  const unverifiedSpoofDb = testEnv.authenticatedContext("spoof_uid", {
    email: KASIR_EMAIL,
    email_verified: false,
  }).firestore();

  const created = ts(15000);
  await assertSucceeds(
    ownerDb.collection("stores").doc(STORE_ID).set(makeStorePayload(created))
  );

  // Owner updates store memberEmails and creates invite
  await assertSucceeds(
    ownerDb.collection("stores").doc(STORE_ID).update({
      memberEmails: [OWNER_EMAIL, KASIR_EMAIL],
      updatedAt: ts(8000),
    })
  );

  await assertSucceeds(
    ownerDb.collection("staffInvites").doc("inv_1").set({
      storeId: STORE_ID,
      storeName: "Toko Berkah",
      ownerUid: OWNER_UID,
      staffEmail: KASIR_EMAIL,
      staffName: "Siti Kasir",
      role: "KASIR",
      canAccessKasir: true,
      canManageProducts: false,
      canManageCategories: false,
      canViewTransactions: true,
      canViewReports: false,
      canManageSettings: false,
      status: "PENDING",
      createdAt: ts(8000),
      updatedAt: ts(8000),
    })
  );

  // Unverified email spoof must fail to read invite
  await assertFails(
    unverifiedSpoofDb
      .collection("staffInvites")
      .where("staffEmail", "==", KASIR_EMAIL)
      .get()
  );

  // Verified Kasir queries invite & accepts in atomic batch
  await assertSucceeds(
    kasirDb.collection("staffInvites").where("staffEmail", "==", KASIR_EMAIL).get()
  );

  const acceptBatch = kasirDb.batch();
  acceptBatch.update(kasirDb.collection("staffInvites").doc("inv_1"), {
    status: "ACCEPTED",
    acceptedByUid: KASIR_UID,
    updatedAt: ts(1000),
  });
  acceptBatch.set(
    kasirDb.collection("stores").doc(STORE_ID).collection("staff").doc(KASIR_UID),
    {
      staffUid: KASIR_UID,
      storeId: STORE_ID,
      ownerUid: OWNER_UID,
      inviteId: "inv_1",
      email: KASIR_EMAIL,
      displayName: "Siti Kasir",
      role: "KASIR",
      active: true,
      canAccessKasir: true,
      canManageProducts: false,
      canManageCategories: false,
      canViewTransactions: true,
      canViewReports: false,
      canManageSettings: false,
      createdAt: ts(1000),
      updatedAt: ts(1000),
    }
  );
  acceptBatch.update(kasirDb.collection("stores").doc(STORE_ID), {
    memberUids: [OWNER_UID, KASIR_UID],
    updatedAt: ts(1000),
  });
  await assertSucceeds(acceptBatch.commit());

  // Kasir can now read store via memberUids
  await assertSucceeds(
    kasirDb
      .collection("stores")
      .where("memberUids", "array-contains", KASIR_UID)
      .get()
  );

  // Kasir cannot overwrite owner settings
  await assertFails(
    kasirDb.collection("stores").doc(STORE_ID).update({
      name: "Hijacked Store",
      updatedAt: ts(500),
    })
  );
});

test("Customer profile CRUD, loyalty point tracking, customer-linked transaction & isolation", async () => {
  const ownerDb = testEnv.authenticatedContext(OWNER_UID, {
    email: OWNER_EMAIL,
    email_verified: true,
  }).firestore();
  const strangerDb = testEnv.authenticatedContext(STRANGER_UID, {
    email: STRANGER_EMAIL,
    email_verified: true,
  }).firestore();
  const created = ts(15000);

  await assertSucceeds(
    ownerDb.collection("stores").doc(STORE_ID).set(makeStorePayload(created))
  );

  await assertSucceeds(
    ownerDb.collection("stores").doc(STORE_ID).collection("products").doc("prod_c1").set({
      storeId: STORE_ID,
      ownerUid: OWNER_UID,
      memberUids: [OWNER_UID],
      memberEmails: [OWNER_EMAIL],
      name: "Kopi Arabika",
      categoryId: "cat_1",
      categoryName: "Minuman",
      barcode: "899000111",
      costPrice: 15000,
      sellPrice: 25000,
      stock: 20,
      unit: "pcs",
      minStockAlert: 5,
      createdAt: created,
      updatedAt: created,
    })
  );

  const custRef = ownerDb.collection("stores").doc(STORE_ID).collection("customers").doc("cust_1");
  await assertSucceeds(
    custRef.set({
      storeId: STORE_ID,
      ownerUid: OWNER_UID,
      memberUids: [OWNER_UID],
      memberEmails: [OWNER_EMAIL],
      name: "Ani Pelanggan",
      phone: "081298765432",
      email: "ani@pelanggan.id",
      address: "Jl. Sudirman No. 5",
      notes: "Suka kopi tanpa gula",
      loyaltyPoints: 10,
      totalSpent: 0,
      visitCount: 0,
      createdAt: created,
      updatedAt: created,
    })
  );

  // Scoped customer list query succeeds; unfiltered or stranger fails
  await assertSucceeds(
    ownerDb
      .collection("stores")
      .doc(STORE_ID)
      .collection("customers")
      .where("memberEmails", "array-contains", OWNER_EMAIL)
      .get()
  );
  await assertFails(
    strangerDb.collection("stores").doc(STORE_ID).collection("customers").get()
  );
  await assertFails(
    strangerDb
      .collection("stores")
      .doc(STORE_ID)
      .collection("customers")
      .where("memberEmails", "array-contains", OWNER_EMAIL)
      .get()
  );

  // Reject negative loyaltyPoints or ghost field
  await assertFails(
    custRef.update({
      loyaltyPoints: -5,
      updatedAt: ts(2000),
    })
  );
  await assertFails(
    custRef.update({
      vipHack: true,
      updatedAt: ts(2000),
    })
  );

  // Atomic batch checkout linked to customer updates stock, transaction, and customer loyalty
  const txTime = ts(1000);
  const batch = ownerDb.batch();
  const txRef = ownerDb.collection("stores").doc(STORE_ID).collection("transactions").doc("tx_cust_1");
  const prodRef = ownerDb.collection("stores").doc(STORE_ID).collection("products").doc("prod_c1");
  batch.set(txRef, {
    storeId: STORE_ID,
    ownerUid: OWNER_UID,
    memberUids: [OWNER_UID],
    memberEmails: [OWNER_EMAIL],
    invoiceNumber: "INV-CUST-001",
    cashierUid: OWNER_UID,
    cashierName: "Budi Owner",
    note: "Member",
    items: [
      {
        productId: "prod_c1",
        productName: "Kopi Arabika",
        categoryId: "cat_1",
        categoryName: "Minuman",
        unit: "pcs",
        quantity: 2,
        costPrice: 15000,
        sellPrice: 25000,
        lineTotal: 50000,
        lineProfit: 20000,
      },
    ],
    subtotal: 50000,
    discountAmount: 0,
    discountType: "NOMINAL",
    taxAmount: 0,
    totalAmount: 50000,
    totalCost: 30000,
    totalProfit: 20000,
    paymentMethod: "TUNAI",
    paymentStatus: "VERIFIED",
    gatewayProvider: "",
    gatewayOrderId: "",
    cashReceived: 50000,
    changeAmount: 0,
    customerId: "cust_1",
    customerName: "Ani Pelanggan",
    pointsEarned: 5,
    pointsRedeemed: 0,
    createdAt: txTime,
    updatedAt: txTime,
  });
  batch.update(prodRef, { stock: 18, updatedAt: txTime });
  batch.update(custRef, {
    loyaltyPoints: 15,
    totalSpent: 50000,
    visitCount: 1,
    lastPurchaseAt: txTime,
    updatedAt: txTime,
  });
  await assertSucceeds(batch.commit());
});

