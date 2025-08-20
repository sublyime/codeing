package com.chad.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

@RestController
public class ChemicalController {

    private final RestTemplate restTemplate = new RestTemplate();

    @GetMapping("/api/chemicals/search")
    public String searchChemicals(@RequestParam String q) {
        String url = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/"
                + q + "/JSON?f=json";
        return restTemplate.getForObject(url, String.class);
    }
}
