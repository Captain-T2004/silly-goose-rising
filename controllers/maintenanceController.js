const { ShipModel, MaintenanceLogModel } = require('../models');

const getMaintenanceSchedule = async (req, res) => {
  try {
    if (req.query.shipId) {
      const shipId = req.query.shipId;
      const ship = await ShipModel.findById(shipId);

      if (!ship) {
        return res.status(404).json({ error: 'Ship not found' });
      }

      const maintenanceLogs = await MaintenanceLogModel.findByShipId(shipId);
      const upcomingMaintenance = await MaintenanceLogModel.findUpcomingMaintenance();
      const nextMaintenance = upcomingMaintenance.find(m => m.shipId === shipId);

      return res.json({
        ship,
        maintenanceHistory: maintenanceLogs,
        nextScheduledMaintenance: nextMaintenance
      });
    }

    const upcomingMaintenance = await MaintenanceLogModel.findUpcomingMaintenance();
    res.json({ upcomingMaintenance });
  } catch (error) {
    console.error('Error in maintenance schedule:', error);
    res.status(500).json({ error: 'Failed to retrieve maintenance schedule' });
  }
};

module.exports = {
  getMaintenanceSchedule
};