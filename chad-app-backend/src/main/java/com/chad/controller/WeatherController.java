package com.chad.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

@RestController
public class WeatherController {

    private final RestTemplate restTemplate = new RestTemplate();

    @GetMapping("/api/weather/current")
    public String getCurrentWeather(@RequestParam double lat, @RequestParam double lon) {
        String url = String.format("https://api.weather.gov/points/%f,%f", lat, lon);
        return restTemplate.getForObject(url, String.class);
    }
}
