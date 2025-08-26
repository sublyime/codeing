package com.chad.model;

public class DispersionInput {

    private String model; // e.g., "GAUSSIAN"
    private String chemicalName;
    private IncidentType incidentType; // Enum defined below
    private double latitude;
    private double longitude;
    private double sourceReleaseRate; // e.g., kg/s
    private double windSpeed; // m/s
    private double windDirection; // degrees from north
    private String sourceReleaseType;
    private StabilityClass stabilityClass; // Enum defined below

    // New field to hold chemical properties JSON
    private String chemicalPropertiesJson;

    // Enum for chemical incident type
    public enum IncidentType {
        GAS,
        LIQUID,
        VAPOR_CLOUD
    }

    // Enum for atmospheric stability classes
    public enum StabilityClass {
        A, B, C, D, E, F
    }

    public DispersionInput() {
        // Default constructor
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getChemicalName() {
        return chemicalName;
    }

    public void setChemicalName(String chemicalName) {
        this.chemicalName = chemicalName;
    }

    public IncidentType getIncidentType() {
        return incidentType;
    }

    public void setIncidentType(IncidentType incidentType) {
        this.incidentType = incidentType;
    }

    public double getLatitude() {
        return latitude;
    }

    public void setLatitude(double latitude) {
        this.latitude = latitude;
    }

    public double getLongitude() {
        return longitude;
    }

    public void setLongitude(double longitude) {
        this.longitude = longitude;
    }

    public double getSourceReleaseRate() {
        return sourceReleaseRate;
    }

    public void setSourceReleaseRate(double sourceReleaseRate) {
        this.sourceReleaseRate = sourceReleaseRate;
    }

    public double getWindSpeed() {
        return windSpeed;
    }

    public void setWindSpeed(double windSpeed) {
        this.windSpeed = windSpeed;
    }

    public double getWindDirection() {
        return windDirection;
    }

    public void setWindDirection(double windDirection) {
        this.windDirection = windDirection;
    }

    public StabilityClass getStabilityClass() {
        return stabilityClass;
    }

    public void setStabilityClass(StabilityClass stabilityClass) {
        this.stabilityClass = stabilityClass;
    }

    public String getSourceReleaseType() {
        return sourceReleaseType;
    }

    public void setSourceReleaseType(String sourceReleaseType) {
        this.sourceReleaseType = sourceReleaseType;
    }

    public String getChemicalPropertiesJson() {
        return chemicalPropertiesJson;
    }

    public void setChemicalPropertiesJson(String chemicalPropertiesJson) {
        this.chemicalPropertiesJson = chemicalPropertiesJson;
    }
}
