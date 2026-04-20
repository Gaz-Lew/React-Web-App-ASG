/**
 * DEAL PIPELINE - STATUS SYSTEM MIGRATION GUIDE
 * 
 * Run this in browser console to migrate existing deals from old status system to new simplified system
 * 
 * OLD STATUS SYSTEM (8 statuses):
 * - Booked
 * - Appointment Set
 * - Appointment Done
 * - Application In
 * - Under Assessment
 * - Approved
 * - Settlement
 * - Complete
 * 
 * NEW STATUS SYSTEM (6 statuses):
 * - lead (default for new deals)
 * - qualified
 * - conditional
 * - unconditional
 * - settled
 * - lost
 * 
 * USAGE:
 * 1. Open your app in browser
 * 2. Open DevTools Console (F12)
 * 3. Paste this entire file content
 * 4. Run: await migrateDealStatuses()
 */

const STATUS_MAP = {
  // Direct mappings
  'Booked': 'lead',
  'Appointment Set': 'qualified',
  'Appointment Done': 'qualified',
  'Application In': 'conditional',
  'Under Assessment': 'conditional',
  'Approved': 'unconditional',
  'Settlement': 'unconditional',
  'Complete': 'settled',
  
  // Handle any legacy DNQ or failed deals
  'DNQ': 'lost',
  'Failed': 'lost',
  'Cancelled': 'lost',
};

async function migrateDealStatuses() {
  console.log('🔄 Starting deal status migration...');
  console.log('📋 This will update all deals with old statuses to the new simplified system');
  
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  
  try {
    // Import Firebase dynamically
    const { getFirestore, collection, getDocs, updateDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
    const db = getFirestore();
    
    const snapshot = await getDocs(collection(db, 'deals'));
    console.log(`📊 Found ${snapshot.docs.length} deals to process`);
    
    for (const dealDoc of snapshot.docs) {
      try {
        const data = dealDoc.data();
        const oldStatus = data.status;
        const newStatus = STATUS_MAP[oldStatus];
        
        // Skip if already using new status system
        if (!newStatus) {
          if (['lead', 'qualified', 'conditional', 'unconditional', 'settled', 'lost'].includes(oldStatus)) {
            skipped++;
            console.log(`⏭️  Skipped (already migrated): ${data.clientName}`);
          } else {
            errors++;
            console.error(`❌ Unknown status "${oldStatus}" for: ${data.clientName}`);
          }
          continue;
        }
        
        // Skip if status is already correct
        if (newStatus === oldStatus) {
          skipped++;
          continue;
        }
        
        // Update the deal
        await updateDoc(doc(db, 'deals', dealDoc.id), {
          status: newStatus
        });
        
        migrated++;
        console.log(`✅ Migrated: ${data.clientName} | ${oldStatus} → ${newStatus}`);
        
      } catch (err) {
        errors++;
        console.error(`❌ Failed to migrate deal ${dealDoc.id}:`, err);
      }
    }
    
    console.log('\n🎉 Migration Complete!');
    console.log(`✅ Migrated: ${migrated} deals`);
    console.log(`⏭️  Skipped: ${skipped} deals`);
    console.log(`❌ Errors: ${errors} deals`);
    console.log(`📊 Total: ${snapshot.docs.length} deals`);
    
    if (migrated > 0) {
      console.log('\n✨ Your deals have been migrated to the new status system!');
      console.log('🔄 Refresh the page to see the changes');
    }
    
  } catch (err) {
    console.error('❌ Migration failed:', err);
    console.log('\n💡 Make sure you have Firebase SDK loaded');
  }
}

// Make it globally available
window.migrateDealStatuses = migrateDealStatuses;

console.log('✅ Migration function ready!');
console.log('👉 Run: await migrateDealStatuses()');
