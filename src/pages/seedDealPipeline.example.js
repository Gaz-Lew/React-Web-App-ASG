/**
 * Seed Data for Deal Pipeline Dashboard
 * 
 * Run this in your browser console or as a Firebase Cloud Function
 * to populate the "deals" collection with example data.
 * 
 * Usage:
 * 1. Open your app in browser
 * 2. Open DevTools Console (F12)
 * 3. Import Firebase: `import { getFirestore, collection, addDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js'`
 * 4. Or paste this code after initializing `db` variable
 */

const EXAMPLE_DEALS = [
  {
    clientName: "John & Sarah Smith",
    status: "Settlement",
    dealValue: 850000,
    commissionTotal: 8500,
    commissionPaid: 6000,
    expectedSettlementDate: "2026-04-15",
    assignedTo: 1, // Garry
    lastUpdate: Date.now() - 86400000, // 1 day ago
    notes: [
      {
        id: "note_1",
        text: "Settlement confirmed for 15th April. Client is ready to proceed.",
        createdAt: Date.now() - 86400000,
        createdBy: "Garry",
        createdById: 1,
      },
      {
        id: "note_2",
        text: "All documents signed and returned. Application approved.",
        createdAt: Date.now() - 172800000,
        createdBy: "Garry",
        createdById: 1,
      },
    ],
    createdAt: Date.now() - 604800000, // 7 days ago
    createdBy: "Garry",
  },
  {
    clientName: "Michael Chen",
    status: "Approved",
    dealValue: 620000,
    commissionTotal: 6200,
    commissionPaid: 3000,
    expectedSettlementDate: "2026-04-22",
    assignedTo: 2, // Blake
    lastUpdate: Date.now() - 172800000,
    notes: [
      {
        id: "note_3",
        text: "Loan approved! Waiting for client to confirm settlement date.",
        createdAt: Date.now() - 172800000,
        createdBy: "Blake",
        createdById: 2,
      },
    ],
    createdAt: Date.now() - 1209600000, // 14 days ago
    createdBy: "Blake",
  },
  {
    clientName: "Emma Thompson & David Wilson",
    status: "Under Assessment",
    dealValue: 1200000,
    commissionTotal: 12000,
    commissionPaid: 0,
    expectedSettlementDate: "2026-05-10",
    assignedTo: 3, // Mike
    lastUpdate: Date.now() - 259200000, // 3 days ago
    notes: [
      {
        id: "note_4",
        text: "Application submitted to lender. Awaiting assessment.",
        createdAt: Date.now() - 259200000,
        createdBy: "Mike",
        createdById: 3,
      },
      {
        id: "note_5",
        text: "Financials compiled and sent to accountant for review.",
        createdAt: Date.now() - 345600000,
        createdBy: "Mike",
        createdById: 3,
      },
    ],
    createdAt: Date.now() - 1814400000, // 21 days ago
    createdBy: "Mike",
  },
  {
    clientName: "Lisa & Mark Robertson",
    status: "Application In",
    dealValue: 750000,
    commissionTotal: 7500,
    commissionPaid: 0,
    expectedSettlementDate: "2026-05-20",
    assignedTo: 1,
    lastUpdate: Date.now() - 345600000,
    notes: [
      {
        id: "note_6",
        text: "Preparing application documents. Client needs to provide tax returns.",
        createdAt: Date.now() - 345600000,
        createdBy: "Garry",
        createdById: 1,
      },
    ],
    createdAt: Date.now() - 2592000000, // 30 days ago
    createdBy: "Garry",
  },
  {
    clientName: "Patricia Martinez",
    status: "Appointment Done",
    dealValue: 480000,
    commissionTotal: 4800,
    commissionPaid: 0,
    expectedSettlementDate: "2026-06-01",
    assignedTo: 4, // Josh
    lastUpdate: Date.now() - 432000000, // 5 days ago
    notes: [
      {
        id: "note_7",
        text: "First consult completed. Client interested in SMSF setup.",
        createdAt: Date.now() - 432000000,
        createdBy: "Josh",
        createdById: 4,
      },
    ],
    createdAt: Date.now() - 3456000000, // 40 days ago
    createdBy: "Josh",
  },
  {
    clientName: "Robert & Helen Anderson",
    status: "Appointment Set",
    dealValue: 920000,
    commissionTotal: 9200,
    commissionPaid: 0,
    expectedSettlementDate: "2026-06-15",
    assignedTo: 2,
    lastUpdate: Date.now() - 518400000,
    notes: [
      {
        id: "note_8",
        text: "Appointment scheduled for next Tuesday at 2pm.",
        createdAt: Date.now() - 518400000,
        createdBy: "Blake",
        createdById: 2,
      },
    ],
    createdAt: Date.now() - 4320000000, // 50 days ago
    createdBy: "Blake",
  },
  {
    clientName: "James Taylor",
    status: "Booked",
    dealValue: 560000,
    commissionTotal: 5600,
    commissionPaid: 0,
    expectedSettlementDate: "2026-06-30",
    assignedTo: 5, // Kai
    lastUpdate: Date.now() - 604800000,
    notes: [],
    createdAt: Date.now() - 5184000000, // 60 days ago
    createdBy: "Kai",
  },
  {
    clientName: "Susan & Peter Brown",
    status: "Complete",
    dealValue: 680000,
    commissionTotal: 6800,
    commissionPaid: 6800,
    expectedSettlementDate: "2026-03-20",
    assignedTo: 1,
    lastUpdate: Date.now() - 1209600000,
    notes: [
      {
        id: "note_9",
        text: "Deal complete! Commission received in full.",
        createdAt: Date.now() - 1209600000,
        createdBy: "Garry",
        createdById: 1,
      },
      {
        id: "note_10",
        text: "Settlement went through smoothly. Client very happy.",
        createdAt: Date.now() - 1296000000,
        createdBy: "Garry",
        createdById: 1,
      },
    ],
    createdAt: Date.now() - 7776000000, // 90 days ago
    createdBy: "Garry",
  },
  {
    clientName: "Jennifer Lee & Tom Harris",
    status: "Settlement",
    dealValue: 1050000,
    commissionTotal: 10500,
    commissionPaid: 5000,
    expectedSettlementDate: "2026-04-10",
    assignedTo: 3,
    lastUpdate: Date.now() - 86400000,
    notes: [
      {
        id: "note_11",
        text: "OVERDUE: Settlement was scheduled for 10th. Following up with client.",
        createdAt: Date.now() - 86400000,
        createdBy: "Mike",
        createdById: 3,
      },
    ],
    createdAt: Date.now() - 6912000000, // 80 days ago
    createdBy: "Mike",
  },
  {
    clientName: "Andrew & Nicole White",
    status: "Approved",
    dealValue: 790000,
    commissionTotal: 7900,
    commissionPaid: 4000,
    expectedSettlementDate: "2026-04-28",
    assignedTo: 6, // Vinu
    lastUpdate: Date.now() - 259200000,
    notes: [
      {
        id: "note_12",
        text: "Loan approved with favorable terms. Client notified.",
        createdAt: Date.now() - 259200000,
        createdBy: "Vinu",
        createdById: 6,
      },
    ],
    createdAt: Date.now() - 8640000000, // 100 days ago
    createdBy: "Vinu",
  },
];

/**
 * Seed the database
 * 
 * Run this after importing Firebase SDK:
 * 
 * import { getFirestore, collection, addDoc } from 'firebase/firestore';
 * const db = getFirestore();
 * 
 * Then paste this function:
 */
async function seedDealPipeline() {
  console.log("🌱 Sealing Deal Pipeline with example data...");
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const deal of EXAMPLE_DEALS) {
    try {
      await addDoc(collection(db, "deals"), deal);
      successCount++;
      console.log(`✅ Added: ${deal.clientName}`);
    } catch (error) {
      errorCount++;
      console.error(`❌ Failed to add ${deal.clientName}:`, error);
    }
  }
  
  console.log(`\n🎉 Seeding complete!`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📊 Total: ${EXAMPLE_DEALS.length}`);
}

// Run it!
seedDealPipeline();

// ── Manual Usage (if you want to add one deal at a time) ──────────────────
// 
// async function addSingleDeal() {
//   await addDoc(collection(db, "deals"), {
//     clientName: "Your Client Name",
//     status: "Booked", // or any DealStatus
//     dealValue: 500000,
//     commissionTotal: 5000,
//     commissionPaid: 0,
//     expectedSettlementDate: "2026-05-01",
//     assignedTo: 1, // rep ID
//     lastUpdate: Date.now(),
//     notes: [],
//     createdAt: Date.now(),
//     createdBy: "Your Name",
//   });
// }
// 
// addSingleDeal();
