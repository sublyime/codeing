package com.chad.service.model.impl.sources;

import com.chad.model.Chemical;
import com.chad.model.DispersionInput;
import com.chad.model.DispersionResult;
import com.chad.service.ChemicalService;
import com.chad.service.model.DispersionModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

@Component
public class TankSourceStrengthModel implements DispersionModel {

    private final ChemicalService chemicalService;

    @Autowired
    public TankSourceStrengthModel(ChemicalService chemicalService) {
        this.chemicalService = chemicalService;
    }

    @Override
    public DispersionResult calculate(DispersionInput input) {
        // Default physical properties
        double liquidDensity = 1000; // kg/m3
        double vaporPressure = 3000; // Pa
        double tankPressure = 101325; // Pa, default atmospheric
        double tankTemp = 298.15; // K (25°C)
        double holeDiameter = 0.05; // 5 cm hole diameter (example)
        double dischargeCoefficient = 0.61; // typical for holes
        double holeArea = Math.PI * Math.pow(holeDiameter / 2.0, 2);

        String chemicalName = input.getChemicalName();
        if (chemicalName != null && !chemicalName.isEmpty()) {
            Optional<Chemical> chemicalOpt = chemicalService.findByName(chemicalName);
            if (chemicalOpt.isPresent()) {
                Map<String, Object> properties = chemicalOpt.get().getProperties();
                if (properties != null) {
                    Object density = properties.get("liquidDensity");
                    if (density instanceof Number)
                        liquidDensity = ((Number) density).doubleValue();

                    Object vp = properties.get("vaporPressure");
                    if (vp instanceof Number)
                        vaporPressure = ((Number) vp).doubleValue();

                    Object tPressure = properties.get("tankPressure"); // Optional
                    if (tPressure instanceof Number)
                        tankPressure = ((Number) tPressure).doubleValue();

                    Object tTemp = properties.get("tankTemperature"); // Optional
                    if (tTemp instanceof Number)
                        tankTemp = ((Number) tTemp).doubleValue();

                    Object holeDiaObj = properties.get("holeDiameter");
                    if (holeDiaObj instanceof Number) {
                        holeDiameter = ((Number) holeDiaObj).doubleValue();
                        holeArea = Math.PI * Math.pow(holeDiameter / 2.0, 2);
                    }

                    Object dCoefficient = properties.get("dischargeCoefficient");
                    if (dCoefficient instanceof Number) {
                        dischargeCoefficient = ((Number) dCoefficient).doubleValue();
                    }
                }
            }
        }

        // Bernoulli equation for liquid mass flow rate from tank hole (simplified for
        // non-boiling liquid below BP)
        double ambientPressure = 101325; // Pa
        double hydrostaticPressure = liquidDensity * 9.81 * holeDiameter; // approximate height = holeDiameter for demo

        // Pressure at hole assuming liquid level above hole with vapor pressure +
        // hydrostatic pressure
        double drivingPressure = tankPressure + hydrostaticPressure;

        // Prevent driving pressure from going below ambient pressure
        if (drivingPressure < ambientPressure) {
            drivingPressure = 1.01 * ambientPressure; // small overpressure to allow flow
        }

        // Mass flow rate Q = Cd * A * sqrt(2 * rho * (P_hole - P_atm))
        double massFlowRate = dischargeCoefficient * holeArea
                * Math.sqrt(2 * liquidDensity * (drivingPressure - ambientPressure));

        DispersionResult result = new DispersionResult();
        result.setHazardSummary(Map.of(
                "massFlowRate_kg_per_s", massFlowRate,
                "liquidDensity_kg_per_m3", liquidDensity,
                "vaporPressure_Pa", vaporPressure,
                "tankPressure_Pa", tankPressure,
                "tankTemperature_K", tankTemp,
                "holeDiameter_m", holeDiameter,
                "dischargeCoefficient", dischargeCoefficient));

        return result;
    }
}
