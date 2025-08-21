package com.chad.model;

import java.util.List;
import java.util.Map;

public class DispersionResult {
    private String geoJsonPlume; // GeoJSON string representation of the plume polygon

    private Map<String, Object> hazardSummary; // e.g. max concentration, affected area info

    private List<Map<String, Object>> concentrationContours; // optional detailed data

    public DispersionResult() {
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
}
