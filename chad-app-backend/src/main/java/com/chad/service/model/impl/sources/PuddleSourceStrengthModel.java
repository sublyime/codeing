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
public class PuddleSourceStrengthModel implements DispersionModel {

    private final ChemicalService chemicalService;

    @Autowired
    public PuddleSourceStrengthModel(ChemicalService chemicalService) {
        this.chemicalService = chemicalService;
    }

    @Override
    public DispersionResult calculate(DispersionInput input) {
        // Default values
        double puddleTemp = 298.15; // K (25°C)
        double vaporPressure = 3000; // Pa
        double liquidDensity = 1000; // kg/m3
        double latentHeatVaporization = 2.5e6; // J/kg

        String chemicalName = input.getChemicalName();
        if (chemicalName != null && !chemicalName.isEmpty()) {
            Optional<Chemical> chemicalOpt = chemicalService.findByName(chemicalName);
            if (chemicalOpt.isPresent()) {
                Map<String, Object> properties = chemicalOpt.get().getProperties();
                if (properties != null) {
                    Object vp = properties.get("vaporPressure");
                    if (vp instanceof Number)
                        vaporPressure = ((Number) vp).doubleValue();

                    Object density = properties.get("liquidDensity");
                    if (density instanceof Number)
                        liquidDensity = ((Number) density).doubleValue();

                    Object latentHeat = properties.get("heatOfVaporization");
                    if (latentHeat instanceof Number)
                        latentHeatVaporization = ((Number) latentHeat).doubleValue();

                    Object tempVal = properties.get("defaultTemperature");
                    if (tempVal instanceof Number)
                        puddleTemp = ((Number) tempVal).doubleValue();
                }
            }
        }

        double windSpeed = input.getWindSpeed();
        double puddleArea = input.getSourceReleaseRate(); // expecting m²; adjust if needed
        double ambientPressure = 101325; // Pa
        double referenceHeight = 10.0; // meters

        double frictionVelocity = calculateFrictionVelocity(windSpeed, referenceHeight);
        double massTransferCoefficient = calculateMassTransferCoefficient(frictionVelocity, vaporPressure,
                ambientPressure);
        double saturatedConcentration = vaporPressure / (287.05 * puddleTemp); // Ideal gas approx.
        double evaporationFlux = saturatedConcentration * frictionVelocity * massTransferCoefficient;
        double evaporationRate = evaporationFlux * puddleArea;

        DispersionResult result = new DispersionResult();
        result.setHazardSummary(Map.of(
                "evaporationRate_kg_per_s", evaporationRate,
                "puddleTemperature_K", puddleTemp,
                "vaporPressure_Pa", vaporPressure,
                "liquidDensity_kg_per_m3", liquidDensity,
                "heatOfVaporization_J_per_kg", latentHeatVaporization));

        return result;
    }

    private double calculateFrictionVelocity(double windSpeed, double height) {
        double roughnessLength = 0.03; // Open country roughness length in meters
        if (height <= roughnessLength)
            height = roughnessLength * 1.1;
        return 0.03 * windSpeed / Math.log(height / roughnessLength);
    }

    private double calculateMassTransferCoefficient(double frictionVelocity, double vaporPressure,
            double ambientPressure) {
        double j = 0.1; // base coefficient placeholder; refine per NOAA formulas
        if (vaporPressure >= ambientPressure)
            vaporPressure = ambientPressure * 0.99;
        double correctionFactor = Math.log(1 - vaporPressure / ambientPressure);
        if (correctionFactor == 0)
            correctionFactor = 1e-6;
        return j / Math.abs(correctionFactor);
    }
}
