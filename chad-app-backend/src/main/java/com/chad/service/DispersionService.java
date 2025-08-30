package com.chad.service;

import com.chad.model.DispersionInput;
import com.chad.model.DispersionResult;
import com.chad.service.model.impl.GaussianDispersionModel;
import com.chad.service.model.impl.AlohaDispersionModel;
import com.chad.service.model.impl.sources.PuddleSourceStrengthModel;
import com.chad.service.model.impl.sources.TankSourceStrengthModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

@Service
public class DispersionService {

    private final GaussianDispersionModel gaussianModel;
    private final AlohaDispersionModel alohaModel;
    private final PuddleSourceStrengthModel puddleSourceModel;
    private final TankSourceStrengthModel tankSourceModel;
    private final WebClient weatherClient;

    @Autowired
    public DispersionService(
            GaussianDispersionModel gaussianModel,
            AlohaDispersionModel alohaModel,
            PuddleSourceStrengthModel puddleSourceModel,
            TankSourceStrengthModel tankSourceModel) {
        this.gaussianModel = gaussianModel;
        this.alohaModel = alohaModel;
        this.puddleSourceModel = puddleSourceModel;
        this.tankSourceModel = tankSourceModel;
        this.weatherClient = WebClient.create("https://api.weather.gov");
    }

    public DispersionResult runModel(DispersionInput input) {
        // Fetch weather if wind speed unknown or zero
        if (input.getWindSpeed() == 0) {
            fetchWeather(input);
        }

        String releaseType = (input.getSourceReleaseType() != null && !input.getSourceReleaseType().isBlank())
                ? input.getSourceReleaseType().toUpperCase()
                : "GAS";

        String modelName = (input.getModel() != null && !input.getModel().isBlank())
                ? input.getModel().toUpperCase()
                : "GAUSSIAN";

        switch (modelName) {
            case "GAUSSIAN":
                return handleGaussian(input, releaseType);
            case "ALOHA":
                return handleAloha(input, releaseType);
            case "SOURCE_STRENGTH":
                return handleSourceStrength(input, releaseType);
            default:
                throw new IllegalArgumentException("Unsupported dispersion model: " + modelName);
        }
    }

    private DispersionResult handleGaussian(DispersionInput input, String releaseType) {
        return switch (releaseType) {
            case "GAS" -> gaussianModel.calculateGas(input);
            case "LIQUID" -> gaussianModel.calculateLiquid(input);
            case "CHEMICAL" -> gaussianModel.calculateChemical(input);
            default -> throw new IllegalArgumentException("Unsupported source type for Gaussian model: " + releaseType);
        };
    }

    private DispersionResult handleAloha(DispersionInput input, String releaseType) {
        return switch (releaseType) {
            case "GAS" -> alohaModel.calculateGas(input);
            case "LIQUID" -> alohaModel.calculateLiquid(input);
            case "CHEMICAL" -> alohaModel.calculateChemical(input);
            default -> throw new IllegalArgumentException("Unsupported source type for Aloha model: " + releaseType);
        };
    }

    private DispersionResult handleSourceStrength(DispersionInput input, String releaseType) {
        return switch (releaseType) {
            case "PUDDLE" -> puddleSourceModel.calculate(input);
            case "TANK" -> tankSourceModel.calculate(input);
            default ->
                throw new IllegalArgumentException("Unsupported source type for source strength model: " + releaseType);
        };
    }

    private void fetchWeather(DispersionInput input) {
        try {
            String pointUrl = String.format("/points/%.6f,%.6f", input.getLatitude(), input.getLongitude());

            // TODO: call weather API, parse station list URL from pointUrl response

            String stationsUrl = ""; // TODO: extract after API response

            // TODO: call stationsUrl API and get latest station ID

            String latestStationUrl = ""; // TODO: extract latest observation URL

            // TODO: Fetch latest observation and parse wind speed, direction, stability

            // For now, set placeholder values:
            input.setWindSpeed(3.0);
            input.setWindDirection(270.0);
            input.setStabilityClass(DispersionInput.StabilityClass.D);

        } catch (Exception e) {
            // fallback defaults if API fails
            input.setWindSpeed(1.5);
            input.setWindDirection(180.0);
            input.setStabilityClass(DispersionInput.StabilityClass.D);
        }
    }
}
