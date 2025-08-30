package com.chad.model;

import java.util.List;
import java.util.Map;

/**
 * Represents the result of a dispersion calculation,
 * including plume geometry, hazard summary, and optional concentration
 * contours.
 */
public class DispersionResult {

    /**
     * GeoJSON string representation of the plume polygon or hazard zone.
     */
    private String geoJsonPlume;

    /**
     * A map containing summary hazard metrics, e.g., max concentration, affected
     * area.
     */
    private Map<String, Object> hazardSummary;

    /**
     * Optional list of concentration contour data points or layers.
     */
    private List<Map<String, Object>> concentrationContours;

    public DispersionResult() {
        // Default constructor
    }

    public String getGeoJsonPlume() {
        return geoJsonPlume;
    }

    public void setGeoJsonPlume(String geoJsonPlume) {
        this.geoJsonPlume = geoJsonPlume;
    }

    public Map<String, Object> getHazardSummary() {
        return hazardSummary;
    }

    public void setHazardSummary(Map<String, Object> hazardSummary) {
        this.hazardSummary = hazardSummary;
    }

    public List<Map<String, Object>> getConcentrationContours() {
        return concentrationContours;
    }

    public void setConcentrationContours(List<Map<String, Object>> concentrationContours) {
        this.concentrationContours = concentrationContours;
    }

    @Override
    public String toString() {
        return "DispersionResult{" +
                "geoJsonPlume='" + geoJsonPlume + '\'' +
                ", hazardSummary=" + hazardSummary +
                ", concentrationContours=" + concentrationContours +
                '}';
    }
}
