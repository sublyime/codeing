package com.chad.service;

import com.chad.model.Chemical;
import com.chad.repository.ChemicalRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class ChemicalService {

    private final ChemicalRepository chemicalRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ChemicalService(ChemicalRepository chemicalRepository) {
        this.chemicalRepository = chemicalRepository;
    }

    public Optional<Chemical> findByName(String name) {
        List<Chemical> chemicals = chemicalRepository.findByNameIgnoreCase(name);
        if (chemicals.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(chemicals.get(0));
    }

    // Overloaded method to accept properties as Object and convert to JSON string
    // internally
    public Chemical saveOrUpdateChemical(String name, Object propertiesObject) {
        String propertiesJson;
        try {
            propertiesJson = objectMapper.writeValueAsString(propertiesObject);
        } catch (Exception e) {
            propertiesJson = "{}"; // fallback to empty JSON object
        }

        Optional<Chemical> existing = findByName(name);
        Chemical chemical;
        if (existing.isPresent()) {
            chemical = existing.get();
            chemical.setProperties(propertiesJson);
        } else {
            chemical = new Chemical();
            chemical.setName(name);
            chemical.setProperties(propertiesJson);
        }
        return chemicalRepository.save(chemical);
    }
}
