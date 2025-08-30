package com.chad.service.model.impl;

import com.chad.model.DispersionInput;
import com.chad.model.DispersionResult;
import com.chad.service.model.DispersionModel;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.locationtech.jts.geom.*;
import org.locationtech.jts.io.geojson.GeoJsonWriter;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class GaussianDispersionModel implements DispersionModel {

    private final GeometryFactory geometryFactory = new GeometryFactory();
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Pasquill-Gifford dispersion coefficients for sigma_y and sigma_z by stability
    // class
    private static final Map<String, double[]> dispersionCoefficients = Map.of(
            "A", new double[] { 0.22, 0.20, 0.0001, 0.0001, 0.20, 0.20 },
            "B", new double[] { 0.16, 0.12, 0.0001, 0.0015, 0.12, 0.12 },
            "C", new double[] { 0.11, 0.09, 0.0002, 0.0015, 0.08, 0.08 },
            "D", new double[] { 0.08, 0.06, 0.0015, 0.0015, 0.06, 0.06 },
            "E", new double[] { 0.06, 0.03, 0.0003, 0.0015, 0.03, 0.03 },
            "F", new double[] { 0.04, 0.016, 0.0001, 0.0001, 0.016, 0.016 });

    @Override
    public DispersionResult calculate(DispersionInput input) {
        // Default to gas calculation
        return calculateGas(input);
    }

    public DispersionResult calculateGas(DispersionInput input) {
        return doGaussianCalculation(input, 0.1); // Effective release height in meters
    }

    public DispersionResult calculateLiquid(DispersionInput input) {
        return doGaussianCalculation(input, 0.5); // Assumed release height for liquid puddle
    }

    public DispersionResult calculateChemical(DispersionInput input) {
        double decayRate = 0;
        double molWeightFactor = 1;
        try {
            if (input.getChemicalPropertiesJson() != null) {
                JsonNode props = objectMapper.readTree(input.getChemicalPropertiesJson());
                decayRate = props.path("decayRate").asDouble(0.0);
                molWeightFactor = 1 + props.path("molecularWeight").asDouble(0.0) / 100.0;
            }
        } catch (Exception e) {
            // Ignore parsing errors, use defaults
        }
        double baseHeight = 0.3;
        double effHeight = baseHeight * (1 - decayRate);
        double spreadFactor = molWeightFactor;
        return doGaussianCalculation(input, effHeight, spreadFactor);
    }

    private DispersionResult doGaussianCalculation(DispersionInput input, double effectiveHeight) {
        return doGaussianCalculation(input, effectiveHeight, 1.0);
    }

    private DispersionResult doGaussianCalculation(DispersionInput input, double effectiveHeight, double spreadFactor) {
        // Emission rate (kg/s)
        double Q = input.getSourceReleaseRate();
        double u = input.getWindSpeed();
        if (u <= 0)
            u = 1; // prevent division by zero

        double xMax = 1000; // Max downwind distance in meters for plotting

        // Stability Class (default to D)
        String stability = input.getStabilityClass() != null ? input.getStabilityClass().name() : "D";

        List<Coordinate> coords = new ArrayList<>();
        int points = 50;

        for (int i = 0; i <= points; i++) {
            double x = xMax * i / points;
            double sigmaY = dispersionSigmaY(x, stability) * spreadFactor;
            double yWidth = sigmaY * 3; // 3 sigma approx.

            coords.add(new Coordinate(input.getLongitude() + x * 0.00001, input.getLatitude() + yWidth * 0.00001));
        }

        for (int i = points; i >= 0; i--) {
            double x = xMax * i / points;
            double sigmaY = dispersionSigmaY(x, stability) * spreadFactor;
            double yWidth = sigmaY * 3;

            coords.add(new Coordinate(input.getLongitude() + x * 0.00001, input.getLatitude() - yWidth * 0.00001));
        }

        coords.add(coords.get(0)); // close polygon

        LinearRing ring = geometryFactory.createLinearRing(coords.toArray(new Coordinate[0]));
        Polygon polygon = geometryFactory.createPolygon(ring, null);
        GeoJsonWriter writer = new GeoJsonWriter();
        String geoJson = writer.write(polygon);

        // Estimate max concentration at 100m
        double sigmaYAt100 = dispersionSigmaY(100, stability);
        double sigmaZAt100 = dispersionSigmaZ(100, stability);
        double conc100m = Q / (2 * Math.PI * u * sigmaYAt100 * sigmaZAt100);

        DispersionResult result = new DispersionResult();
        result.setGeoJsonPlume(geoJson);
        result.setHazardSummary(Collections.singletonMap("maxConcentration", conc100m));
        result.setConcentrationContours(Collections.emptyList());

        return result;
    }

    private double dispersionSigmaY(double x, String stability) {
        double[] coeffs = dispersionCoefficients.getOrDefault(stability, dispersionCoefficients.get("D"));
        double a = coeffs[0];
        double b = coeffs[1];
        x = Math.max(x, 0.1);
        return a * Math.pow(x, b);
    }

    private double dispersionSigmaZ(double x, String stability) {
        double[] coeffs = dispersionCoefficients.getOrDefault(stability, dispersionCoefficients.get("D"));
        double a = coeffs[4];
        double b = coeffs[5];
        x = Math.max(x, 0.1);
        return a * Math.pow(x, b);
    }
}
